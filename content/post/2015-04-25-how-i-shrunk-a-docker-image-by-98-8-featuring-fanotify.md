---
title: How I shrunk a Docker image by 98.8% – featuring fanotify
author: Jean-Tiare Le Bigot
layout: post
date: 2015-04-25
url: /2015/04/25/how-i-shrunk-a-docker-image-by-98-8-featuring-fanotify/
categories:
  - Docker
  - Sysadmin
tags:
  - docker
  - fanotify
  - syscall
---
Some weeks ago, I did an internal presentation on Docker. During the presentation, one of the ops asked an seemingly trivial question: Is there anything like a &#8220;diet program for Docker Images&#8221; ?

You can find a couple of pretty decent common-sense powered approach [on the web][1] like removing well known cache folders, temporary files, installing all superfluous packages and flatten layers if not the full image. There is also the `-slim` declination of the official language images.

But, thinking at it, do we _really_ need a full consistent base Linux install? Which files do we _really_ need in a given image? I found a radical and pretty efficient approaches with a go binary. It was statically build, almost no external dependency. [Resulting image][2]: 6.12MB.

Whaou! Is there any chance to do something comparable, deterministic with any random application?

It turns out there could be one. The idea is simple: We could profile the image at run time one way or another to determine which files are ever accessed/opened/&#8230;, then remove all the remaining files. Hmm, sounds promising. Let's PoC it.
  
<!--more-->

**Target definition**:

  * **Start image**: Ubuntu (~200MB)
  * **Application that MUST run**: `/bin/ls`
  * **Goal**: Build the smallest possible image

`/bin/ls` is a good target: It is simple enough for a PoC with no nasty behavior but still not trivial, it uses dynamic linking.

Now that we have a target, let's pick a tool. As this is a proof of concept, using dynamites where a hole puncher would  be enough _IS_ an option, as long as it does the job.

The base idea it to record all file accesses. Be it a stat or a open. There are a couple of good candidates to help with the task. We could use [inotify][3] but it is a pain to setup and watches needs to be attached on every single files, which potentially mean a \*lot\* of watches. We could use LD_PRELOAD but 1/ it's no fun to use, 2/ it won't catch direct syscalls 3/ it won't work with statically linked programs (who said golang's?). A solution that would work well even for statically linked program would be to use [ptrace][4] to trace all syscalls, in realtime. It is also a pain to setup but, it would be a reliable and flexible option. A lesser known linux syscall is [fanotify][5]. As the title suggests, This is the one we'll go with<sup>1</sup>.

`fanotify` syscall has originally been implemented as &#8220;decent&#8221; mechanism for anti-virus vendors to intercept file access events, potentially on a whole mountpoint at once. Sounds familiar? While it may be used to deny file accesses, it may also just report file access events in a non-blocking fashion, potentially dropping<sup>2</sup> events if the kernel queue overflows. In this last case, a special message will be generated to notify user-land listener about the message loss. This is perfectly what I needed. Non intrusive, a whole mountpoint at once, simple setup (well, provided that you find the documentation, no comment&#8230;). This may seem anecdotal but it has its importance, as a learned after.

Using it is fairly simple:

**1/ Init `fanotify` in `FAN_CLASS_NOTIF`ication mode using [`fanotify_init` syscall][6]**

<pre class="brush: cpp; title: ; notranslate" title="">// Open ``fan`` fd for fanotify notifications. Messages will embed a 
// filedescriptor on accessed file. Expect it to be read-only
fan = fanotify_init(FAN_CLASS_NOTIF, O_RDONLY);
</pre>

**2/ Subscribe to `FAN_ACCESS` and `FAN_OPEN` events on &#8220;/&#8221; `FAN_MARK_MOUNT`point using [`fanotify_mark` syscall][7]**

<pre class="brush: cpp; title: ; notranslate" title="">// Watch open/access events on root mountpoint
fanotify_mark(
    fan, 
    FAN_MARK_ADD | FAN_MARK_MOUNT, // Add mountpoint mark to fan
    FAN_ACCESS | FAN_OPEN,         // Report open and access events, non blocking
    -1, "/"                        // Watch root mountpoint (-1 is ignored for FAN_MARK_MOUNT type calls)
);
</pre>

**`3/ read` pending event messages from the filedescriptor returned by `fanotify_init` and iterate using `FAN_EVENT_NEXT`**

<pre class="brush: cpp; title: ; notranslate" title="">// Read pending events from ``fan`` into ``buf``
buflen = read(fan, buf, sizeof(buf));

// Position cursor on first message
metadata = (struct fanotify_event_metadata*)&buf;

// Loop until we reached the last event
while(FAN_EVENT_OK(metadata, buflen)) {
    // Do something interesting with the notification
    // ``metadata-&gt;fd`` will contain a valid, RO fd to accessed file.

    // Close opened fd, otherwise we'll quickly exhaust the fd pool.
    close(metadata-&gt;fd);

    // Move to next event in buffer
    metadata = FAN_EVENT_NEXT(metadata, buflen);
}
</pre>

Putting it all together, we'll print the full name of all accessed files and add queue overflow detection. This should be plain enough for us (comments and error checks stripped for the purpose of this illustration):

<pre class="brush: cpp; title: ; notranslate" title="">#include &lt;fcntl.h&gt;
#include &lt;limits.h&gt;
#include &lt;stdio.h&gt;
#include &lt;sys/fanotify.h&gt;

int main(int argc, char** argv) {
    int fan;
    char buf[4096];
    char fdpath[32];
    char path[PATH_MAX + 1];
    ssize_t buflen, linklen;
    struct fanotify_event_metadata *metadata;

    // Init fanotify structure
    fan = fanotify_init(FAN_CLASS_NOTIF, O_RDONLY);

    // Watch open/access events on root mountpoint
    fanotify_mark(
        fan,
        FAN_MARK_ADD | FAN_MARK_MOUNT,
        FAN_ACCESS | FAN_OPEN,
        -1, "/"
    );

    while(1) {
        buflen = read(fan, buf, sizeof(buf));
        metadata = (struct fanotify_event_metadata*)&buf;

        while(FAN_EVENT_OK(metadata, buflen)) {
            if (metadata-&gt;mask & FAN_Q_OVERFLOW) {
                printf("Queue overflow!\n");
                continue;
            }

            // Resolve path, using automatically opened fd
            sprintf(fdpath, "/proc/self/fd/%d", metadata-&gt;fd);
            linklen = readlink(fdpath, path, sizeof(path) - 1);
            path[linklen] = '&#92;&#48;';
            printf("%s\n", path);

            close(metadata-&gt;fd);
            metadata = FAN_EVENT_NEXT(metadata, buflen);
        }
    }
}
</pre>

To build it, use:

<pre class="brush: bash; title: ; notranslate" title="">gcc main.c --static -o fanotify-profiler
</pre>

We basically now have a tool to report any file access on the active &#8216;/' mountpoint in real time. Good.

What now? Let's create an Ubuntu container, start the recorder and run `/bin/ls`. `fanotify` requires require the &#8220;`CAP_SYS_ADMIN`&#8221; capability. This is basically the &#8220;catch-all&#8221; root [capability][8]. Still better than running in `--privileged` mode though.

<pre class="brush: bash; title: ; notranslate" title=""># Run image
docker run --name profiler_ls \
           --volume $PWD:/src \
           --cap-add SYS_ADMIN \
           -it ubuntu /src/fanotify-profiler

# Run the command to profile, from another shell
docker exec -it profiler_ls ls

# Interrupt Running image using
docker kill profiler_ls # You know, the "dynamite"
</pre>

This should produce an output like:

<pre class="brush: plain; title: ; notranslate" title="">/etc/passwd
/etc/group
/etc/passwd
/etc/group
/bin/ls
/bin/ls
/bin/ls
/lib/x86_64-linux-gnu/ld-2.19.so
/lib/x86_64-linux-gnu/ld-2.19.so
/etc/ld.so.cache
/lib/x86_64-linux-gnu/libselinux.so.1
/lib/x86_64-linux-gnu/libacl.so.1.1.0
/lib/x86_64-linux-gnu/libc-2.19.so
/lib/x86_64-linux-gnu/libc-2.19.so
/lib/x86_64-linux-gnu/libpcre.so.3.13.1
/lib/x86_64-linux-gnu/libdl-2.19.so
/lib/x86_64-linux-gnu/libdl-2.19.so
/lib/x86_64-linux-gnu/libattr.so.1.1.0
</pre>

Awesome! It worked. We now know for sure what `/bin/ls` ultimately needs to run.

So we'll just copy-paste-import all this in a &#8220;`FROM scratch`&#8221; Docker Image and we'll be done. Easy. Well, not so. But let's do it to see by ourselves.

<pre class="brush: bash; title: ; notranslate" title=""># Export base docker image
mkdir ubuntu_base
docker export profiler_ls | sudo tar -x -C ubuntu_base

# Create new image
mkdir ubuntu_lean

# Get the linker (trust me)
sudo mkdir -p ubuntu_lean/lib64
sudo cp -a ubuntu_base/lib64/ld-linux-x86-64.so.2 ubuntu_lean/lib64/

# Copy the files
sudo mkdir -p ubuntu_lean/etc
sudo mkdir -p ubuntu_lean/bin
sudo mkdir -p ubuntu_lean/lib/x86_64-linux-gnu/

sudo cp -a ubuntu_base/bin/ls ubuntu_lean/bin/ls
sudo cp -a ubuntu_base/etc/group ubuntu_lean/etc/group
sudo cp -a ubuntu_base/etc/passwd ubuntu_lean/etc/passwd
sudo cp -a ubuntu_base/etc/ld.so.cache ubuntu_lean/etc/ld.so.cache
sudo cp -a ubuntu_base/lib/x86_64-linux-gnu/ld-2.19.so ubuntu_lean/lib/x86_64-linux-gnu/ld-2.19.so
sudo cp -a ubuntu_base/lib/x86_64-linux-gnu/ld-2.19.so ubuntu_lean/lib/x86_64-linux-gnu/ld-2.19.so
sudo cp -a ubuntu_base/lib/x86_64-linux-gnu/libselinux.so.1 ubuntu_lean/lib/x86_64-linux-gnu/libselinux.so.1
sudo cp -a ubuntu_base/lib/x86_64-linux-gnu/libacl.so.1.1.0 ubuntu_lean/lib/x86_64-linux-gnu/libacl.so.1.1.0
sudo cp -a ubuntu_base/lib/x86_64-linux-gnu/libc-2.19.so ubuntu_lean/lib/x86_64-linux-gnu/libc-2.19.so
sudo cp -a ubuntu_base/lib/x86_64-linux-gnu/libpcre.so.3.13.1 ubuntu_lean/lib/x86_64-linux-gnu/libpcre.so.3.13.1
sudo cp -a ubuntu_base/lib/x86_64-linux-gnu/libdl-2.19.so ubuntu_lean/lib/x86_64-linux-gnu/libdl-2.19.so
sudo cp -a ubuntu_base/lib/x86_64-linux-gnu/libattr.so.1.1.0 ubuntu_lean/lib/x86_64-linux-gnu/libattr.so.1.1.0

# Import it back to Docker
cd ubuntu_lean
sudo tar -c . | docker import - ubuntu_lean
</pre>

Run the resulting image:

<pre class="brush: bash; title: ; notranslate" title="">docker run --rm -it ubuntu_lean /bin/ls
</pre>

And, Tadaaaaa:

<pre class="brush: plain; title: ; notranslate" title=""># If you did not trust me with the linker (as it was already loaded when the profiler started, it does not show in the ouput)
no such file or directoryFATA[0000] Error response from daemon: Cannot start container f318adb174a9e381500431370a245275196a2948828919205524edc107626d78: no such file or directory

# Otherwise
/bin/ls: error while loading shared libraries: libacl.so.1: cannot open shared object file: No such file or directory
</pre>

Well, not so&#8230; What went wrong? Remember when I said this syscall was primarily designed with antivirus in mind? The real-time part of the antivirus is supposed to detect that a file is being accessed, run some checks, take a decision. What matters here is the actual, real content of the file. In particular, filesystem races MUST be avoided at all costs. This is the reason why `fanotify` yields filedescriptors instead of accesses path. Determining the underlying physical file is done by probing `/proc/self/fd/[fd]`. It does not tell you through which symlink the file being accessed was accessed, only what file it is.

To make this work, we need to find all links to reported files and install them in the filtered image as well. A `find` command like this will do the job:

<pre class="brush: bash; title: ; notranslate" title=""># Find all files refering to a given one
find -L -samefile "./lib/x86_64-linux-gnu/libacl.so.1.1.0" 2&gt;/dev/null

# If you want to exclude the target itself from the results
find -L -samefile "./lib/x86_64-linux-gnu/libacl.so.1.1.0" -a ! -path "./lib/x86_64-linux-gnu/libacl.so.1.1.0" 2&gt;/dev/null
</pre>

This can easily be automated with a loop like:

<pre class="brush: plain; title: ; notranslate" title="">for f in $(cd ubuntu_lean; find)
do 
    (
        cd ubuntu_base
        find -L -samefile "$f" -a ! -path "$f"
    ) 2&gt;/dev/null
done
</pre>

Which produces the list of missing symlinks. All libs.

<pre class="brush: plain; title: ; notranslate" title="">./lib/x86_64-linux-gnu/libc.so.6
./lib/x86_64-linux-gnu/ld-linux-x86-64.so.2
./lib/x86_64-linux-gnu/libattr.so.1
./lib/x86_64-linux-gnu/libdl.so.2
./lib/x86_64-linux-gnu/libpcre.so.3
./lib/x86_64-linux-gnu/libacl.so.1
</pre>

Let's copy them too from the source image and re-create the destination image. (Yeah, could also have created them on the fly).

<pre class="brush: bash; title: ; notranslate" title=""># Copy the links
sudo cp -a ubuntu_base/lib/x86_64-linux-gnu/libc.so.6 ubuntu_lean/lib/x86_64-linux-gnu/libc.so.6
sudo cp -a ubuntu_base/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2 ubuntu_lean/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2
sudo cp -a ubuntu_base/lib/x86_64-linux-gnu/libdl.so.2 ubuntu_lean/lib/x86_64-linux-gnu/libdl.so.2
sudo cp -a ubuntu_base/lib/x86_64-linux-gnu/libpcre.so.3 ubuntu_lean/lib/x86_64-linux-gnu/libpcre.so.3
sudo cp -a ubuntu_base/lib/x86_64-linux-gnu/libacl.so.1 ubuntu_lean/lib/x86_64-linux-gnu/libacl.so.1
sudo cp -a ubuntu_base/lib/x86_64-linux-gnu/libattr.so.1 ubuntu_lean/lib/x86_64-linux-gnu/libattr.so.1

# Import it back to Docker
cd ubuntu_lean
docker rmi -f ubuntu_lean; sudo tar -c . | docker import - ubuntu_lean
</pre>

**Warning**: This method is limited. For example, it won't return links to links to files neither absolute links. The later requiring at least a chroot. Or to be run in the source container itself, provided that find or equivalent is present.

Run the resulting image:

<pre class="brush: bash; title: ; notranslate" title="">docker run --rm -it ubuntu_lean /bin/ls
</pre>

And, Tadaaaaa:

<pre class="brush: plain; title: ; notranslate" title="">bin  dev  etc  lib  lib64  proc  sys
</pre>

It works! <sup>tm</sup>

Time is over, let's measure:
  
* **ubuntu**: 209M
  
* **ubuntu_lean**: 2,5M

Resulting Docker image is 83.5 _times_ smaller<sup>3</sup>. That's a 98.8% reduction. Looks good to me, I'll accept it. If you agree.

### Last Thought

Like all profiling based method, it will only tell you about what's actually done/used in a specific scenario. For example, try to run `/bin/ls -l` in the resulting image and see by yourself. (spoiler: it does not work. Well it does, but not as expected).

The profiling technique itself is not without flaws. It does not detect how a file was opened but only which file this is. This is a problem for symlinks, especially cross-filesytems (read: cross-volumes). With fanotify, we'll completely miss the original symlink and break the application.

If I were to build a production shrinker, I would probably go for a `ptrace` based method.

### Footnotes

1. Let's face the truth: What I really wanted, was experimenting with this syscall. Docker images are more of a (good) pretext.
  
2. Actually, one could use `FAN_UNLIMITED_QUEUE` well calling `fanotify_init` to remove this limitation, provided that the calling process is at least `CAP_SYS_ADMIN`
  
2. That's also 2.4 times smaller that the 6.13MB image I mentioned at the beginning of this post. But the comparison is not fair.

 [1]: https://intercityup.com/blog/downsizing-docker-containers.html
 [2]: http://blog.codeship.com/building-minimal-docker-containers-for-go-applications/
 [3]: http://linux.die.net/man/7/inotify "Man Inotify"
 [4]: http://linux.die.net/man/2/ptrace "Man ptrace"
 [5]: http://man7.org/linux/man-pages/man7/fanotify.7.html
 [6]: http://man7.org/linux/man-pages/man2/fanotify_init.2.html
 [7]: http://man7.org/linux/man-pages/man2/fanotify_mark.2.html
 [8]: http://linux.die.net/man/7/capabilities