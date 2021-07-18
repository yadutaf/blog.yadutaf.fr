---
title: 'Introduction to Linux namespaces - Part 1: UTS'
author: Jean-Tiare Le Bigot
layout: post
date: 2013-12-22
url: /2013/12/22/introduction-to-linux-namespaces-part-1-uts/
categories:
  - Security
  - Sysadmin
---
As a part of my job at [OVH][1] I dealt with Linux Namespaces as a security mechanism in a &#8220;yet to be announced&#8221; product. I was astonished by both how powerful and poorly documented it is.

[EDIT 2014-01-08] A Chinese translation of this post is available [here][2]:

Most of you have probably heard about [LXC - LinuX Containers][3], &#8220;Chroot on steroids&#8221;. What it basically does is isolate applications from others. A bit like chroot does by isolating applications in a virtual private root but taking the process further. Internally, LXC relies on 3 main isolation infrastructure of the Linux Kernel:

  1. Chroot
  2. [Cgroups][4]
  3. Namespaces

I could have entitled this article series &#8220;How to build your own LXC&#8221; and probably earned a better Google rank but that would have been quite a bit pretentious. In fact LXC does a lot more than isolation. It also brings template management, freezing, and much much more. What this series really about is more of demystifying than reinventing the wheel.

During this series, we will write a minimal C program starting /bin/bash with more isolation from steps to steps.

Let's start.

What's really interesting with Linux' approach to containers is that precisely it does _not_ provide a &#8220;back-box/magical&#8221; container solution but instead provides individual isolation building blocks called &#8220;Namespaces&#8221;, new one appearing from releases to release. It also allows you to use solely the one you actually need for your specific application.

<!--more-->

As of 3.12, Linux supports 6 Namespaces:

  1. UTS: hostname (this post)
  2. IPC: inter-process communication (in a future post)
  3. PID: &#8220;chroot&#8221; process tree (in a future post)
  4. NS: mount points, first to land in Linux (in a future post)
  5. NET: network access, including interfaces (in a future post)
  6. USER: map virtual, local user-ids to real local ones (in a future post)

Here is a complete skeleton for cleanly launching /bin/bash from a child process: (error checking stripped for clarity/brevity)

<pre class="brush: cpp; highlight: [20,29]; title: main-0-template.c; notranslate" title="main-0-template.c">#define _GNU_SOURCE
#include &lt;sys/types.h&gt;
#include &lt;sys/wait.h&gt;
#include &lt;stdio.h&gt;
#include &lt;sched.h&gt;
#include &lt;signal.h&gt;
#include &lt;unistd.h&gt;

#define STACK_SIZE (1024 * 1024)

static char child_stack[STACK_SIZE];
char* const child_args[] = {
  "/bin/bash",
  NULL
};

int child_main(void* arg)
{
  printf(" - World !\n");
  execv(child_args[0], child_args);
  printf("Ooops\n");
  return 1;
}

int main()
{
  printf(" - Hello ?\n");
  int child_pid = clone(child_main, child_stack+STACK_SIZE, SIGCHLD, NULL);
  waitpid(child_pid, NULL, 0);
  return 0;
}
</pre>

Notice the use of the [&#8220;clone&#8221; syscall][5] instead of the more traditional &#8220;fork&#8221; syscall. This is where the magic (will) happen.

<pre class="brush: bash; title: ; notranslate" title="">jean-tiare@jeantiare-Ubuntu:~/blog$ gcc -Wall main.c -o ns && ./ns
 - Hello ?
 - World !
jean-tiare@jeantiare-Ubuntu:~/blog$ # inside the container
jean-tiare@jeantiare-Ubuntu:~/blog$ exit
jean-tiare@jeantiare-Ubuntu:~/blog$ # outside the container
</pre>

Ok, cool. But pretty hard to notice without the comments that we are in a child /bin/bash. Actually, while writing this post, I accidentally exited the _parent_ shell a couple of times&#8230;

Wouldn't it be cool if we could just change, let's say, the hostname with 0% env vars tricks ? Just plain Namespaces ? Easy, just

  1. add &#8220;CLONE_NEWUTS&#8221; flag to clone
  2. call &#8220;[sethostname][6]&#8221; from _child_

<pre class="brush: cpp; first-line: 15; highlight: [20,29,30]; title: main-1-uts.c; notranslate" title="main-1-uts.c">// (needs root privileges (or appropriate capabilities))
//[...]
int child_main(void* arg)
{
  printf(" - World !\n");
  sethostname("In Namespace", 12);
  execv(child_args[0], child_args);
  printf("Ooops\n");
  return 1;
}

int main()
{
  printf(" - Hello ?\n");
  int child_pid = clone(child_main, child_stack+STACK_SIZE,
      CLONE_NEWUTS | SIGCHLD, NULL);
  waitpid(child_pid, NULL, 0);
  return 0;
}
</pre>

Run it

<pre class="brush: bash; title: ; notranslate" title="">jean-tiare@jeantiare-Ubuntu:~/blog$ gcc -Wall main.c -o ns && sudo ./ns
 - Hello ?
 - World !
root@In Namespace:~/blog$ # inside the container
root@In Namespace:~/blog$ exit
jean-tiare@jeantiare-Ubuntu:~/blog$ # outside the container
</pre>

And that's all folks! (for this first article, at least). Getting started with namespaces is pretty damn easy: clone, set appropriate &#8220;CLONE_NEW*&#8221; flags, setup the new env, done!

Would like to go further ? You might be interested in reading also the [excellent LWN article series on namespaces][7].

 [1]: http://www.ovh.com/
 [2]: http://blog.lucode.net/linux/intro-Linux-namespace-1.html
 [3]: http://linuxcontainers.org/ "LXC - Linux Container official website"
 [4]: https://www.kernel.org/doc/Documentation/cgroups/ "Linux Cgroups. Kernel.org"
 [5]: http://linux.die.net/man/2/clone "Man 2 clone"
 [6]: http://linux.die.net/man/2/sethostname "Man 2 sethostname"
 [7]: http://lwn.net/Articles/531114/ "Linux namespaces, LWN"