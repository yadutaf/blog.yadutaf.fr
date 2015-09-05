---
title: 'Introduction to Linux namespaces - Part 4: NS (FS)'
author: Jean-Tiare Le Bigot
layout: post
date: 2014-01-12
url: /2014/01/12/introduction-to-linux-namespaces-part-4-ns-fs/
categories:
  - Security
  - Sysadmin
tags:
  - linux
  - namespace
---
Following the [previous post on FS namespace][1] (mountpoints table isolation), we will now have a look at an amazing one: isolated mount table. If you haven't done so already, I encourage you to read [the first post of this series for an introduction to linux namespace isolation mechanism][2].

[EDIT 2014-01-08] A Chinese translation of this post is available [here][3]

In the previous post we &#8220;chrooted&#8221; the PID namespace and got a new &#8220;1&#8221; process. But even with this namespace activated, there still lacked isolation for tools like &#8220;top&#8221; because they rely on the &#8220;/proc&#8221; virtual filesystem which is still shared (identical) between namespaces. In this post, let me introduce the namespace that will solve this: &#8220;NS&#8221;. This is historically the first Linux Namespace, hence the name.

Activating it is only a matter of adding &#8220;CLONE_NEWNS&#8221; to the &#8220;clone&#8221; call. It requires no additional setup. It may also be freely combined with other namespaces.

Once activated, any (un)mount operations from the child will only affect the child and vice-versa.

Let's start experimenting. In the previous example, just activate the NS:

<!--more-->

<pre class="brush: cpp; first-line: 43; title: activate-ns-snippet.c; notranslate" title="activate-ns-snippet.c">int child_pid = clone(child_main, child_stack+STACK_SIZE, 
      CLONE_NEWUTS | CLONE_NEWIPC | CLONE_NEWPID | CLONE_NEWNS | SIGCHLD, NULL);
</pre>

Now, if we run it, we finally can fix the issue from the previous post on PID:

<pre class="brush: plain; highlight: [4,7,8]; title: ; notranslate" title="">jean-tiare@jeantiare-Ubuntu:~/blog$ gcc -Wall ns.c -o ns && sudo ./ns
 - [14472] Hello ?
 - [    1] World !
root@In Namespace:~/blog# mount -t proc proc /proc
root@In Namespace:~/blog# ps aux
USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
root         1  1.0  0.0  23620  4680 pts/4    S    00:07   0:00 /bin/bash
root        79  0.0  0.0  18492  1328 pts/4    R+   00:07   0:00 ps aux
root@In Namespace:~/blog# exit
</pre>

Tadaaa ! &#8220;/proc&#8221; is now working as expected from the container, without breaking the parent.

Let's automate it to finalize previous post's example:

<pre class="brush: cpp; highlight: [4,33,51]; title: main-4-ns.c; notranslate" title="main-4-ns.c">#define _GNU_SOURCE
#include &lt;sys/types.h&gt;
#include &lt;sys/wait.h&gt;
#include &lt;sys/mount.h&gt;
#include &lt;stdio.h&gt;
#include &lt;sched.h&gt;
#include &lt;signal.h&gt;
#include &lt;unistd.h&gt;

#define STACK_SIZE (1024 * 1024)

// sync primitive
int checkpoint[2];

static char child_stack[STACK_SIZE];
char* const child_args[] = {
  "/bin/bash",
  NULL
};

int child_main(void* arg)
{
  char c;

  // init sync primitive
  close(checkpoint[1]);

  // setup hostname
  printf(" - [%5d] World !\n", getpid());
  sethostname("In Namespace", 12);

  // remount "/proc" to get accurate "top" && "ps" output
  mount("proc", "/proc", "proc", 0, NULL);

  // wait...
  read(checkpoint[0], &c, 1);

  execv(child_args[0], child_args);
  printf("Ooops\n");
  return 1;
}

int main()
{
  // init sync primitive
  pipe(checkpoint);

  printf(" - [%5d] Hello ?\n", getpid());

  int child_pid = clone(child_main, child_stack+STACK_SIZE,
      CLONE_NEWUTS | CLONE_NEWIPC | CLONE_NEWPID | CLONE_NEWNS | SIGCHLD, NULL);

  // further init here (nothing yet)

  // signal "done"
  close(checkpoint[1]);

  waitpid(child_pid, NULL, 0);
  return 0;
}
</pre>

If you run this snippet, you should get exactly the same behavior as the previous test without manually remounting &#8220;/proc&#8221; neither messing with your real parent's &#8220;/proc&#8221;. Neat isn't it ?

To leverage the power of this technique you could now prepare and enter a chroot to further enhance the isolation. Steps involved would be to prepare a &#8220;debootstrap&#8221;, remount some essentials filesystems like &#8220;/tmp&#8221;, &#8220;/dev/shm&#8221;, &#8220;/proc&#8221;, optionally all or part of &#8220;/dev&#8221; and &#8220;/sys&#8221; and then &#8220;[chdir][4]&#8221; + &#8220;[chroot][5]&#8220;. I'll leave it as an exercise for the reader.

That's all for &#8220;NS&#8221; namespace. With the next article we'll explore an incredibly powerful namespace &#8220;NET&#8221;. It's so powerful that it's used as the foundation of the [&#8220;CORE&#8221; lightweight network simulator][6]. Thanks for reading !

 [1]: https://blog.jtlebi.fr/2014/01/05/introduction-to-linux-namespaces-part-3-pid/ "Introduction to Linux namespaces – Part 4: NS (FS)"
 [2]: https://blog.jtlebi.fr/2013/12/22/introduction-to-linux-namespaces-part-1-uts/ "Introduction to Linux namespaces – Part 1: UTS"
 [3]: http://blog.lucode.net/linux/intro-Linux-namespace-4.html
 [4]: http://linux.die.net/man/2/chdir "man chdir"
 [5]: http://linux.die.net/man/1/chroot "man Chroot"
 [6]: http://cs.itd.nrl.navy.mil/work/core/index.php