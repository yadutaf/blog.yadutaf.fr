---
title: 'Introduction to Linux namespaces - Part 3: PID'
author: Jean-Tiare Le Bigot
layout: post
date: 2014-01-05
url: /2014/01/05/introduction-to-linux-namespaces-part-3-pid/
categories:
  - Security
  - Sysadmin
tags:
  - linux
  - namespace
---
Following the [previous post on IPC namespace][1] (Inter Process Communication isolation), I would now like to introduce my personal favorite one (as sysadmin): PID namespaces. If you haven't done so already, I encourage you to read [the first post of this series for an introduction to linux namespace isolation mechanism][2].

[EDIT 2014-01-08] A Chinese translation of this post is available [here][3]

Yes, that's it, with this namespace it is possible to restart PID numbering and get your own &#8220;1&#8221; process. This could be seen as a &#8220;chroot&#8221; in the process identifier tree. It's extremely handy when you need to deal with pids in day to day work and are stuck with 4 digits numbers&#8230;

Activating it is only a matter of adding &#8220;CLONE_NEWPID&#8221; to the &#8220;clone&#8221; call. It requires no additional setup. It may also be freely combined with other namespaces.

Once activated, the result of getpid() from child process will invariably be &#8220;1&#8221;.

<!--more-->

But, WAIT! I know have to &#8220;1&#8221; process right ? What about process management ?

Well, actually, this \*really\* is much like a &#8220;chroot&#8221;. That is to say, a change of view point.

  * Host: _all_ processes are visible, _global_ PIDs (init=1, &#8230;, child=xxx, &#8230;.)
  * Container: _only child + descendant_ are visible, local PIDs (child=1, &#8230;)

Here is an illustration:

<pre class="brush: cpp; highlight: [29,41,44]; title: ; notranslate" title="">#define _GNU_SOURCE
#include &lt;sys/types.h&gt;
#include &lt;sys/wait.h&gt;
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
  // wait...
  read(checkpoint[0], &c, 1);

  printf(" - [%5d] World !\n", getpid());
  sethostname("In Namespace", 12);
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
      CLONE_NEWUTS | CLONE_NEWIPC | CLONE_NEWPID | SIGCHLD, NULL);

  // further init here (nothing yet)

  // signal "done"
  close(checkpoint[1]);

  waitpid(child_pid, NULL, 0);
  return 0;
}
</pre>

And an example run:

<pre class="brush: plain; title: ; notranslate" title="">jean-tiare@jeantiare-Ubuntu:~/blog$ gcc -Wall main-3-pid.c -o ns && sudo ./ns
 - [ 7823] Hello ?
 - [    1] World !
root@In Namespace:~/blog# echo "=&gt; My PID: $$"
=&gt; My PID: 1
root@In Namespace:~/blog# exit
</pre>

As expected, even thought the parent process as a PID of &#8220;7823&#8221;, the child's PID is &#8220;1&#8221;. If you are playfull, you could try to &#8220;kill -KILL 7823&#8221; the parent process. It would do exactly&#8230; nothing:

<pre class="brush: plain; title: ; notranslate" title="">jean-tiare@jeantiare-Ubuntu:~/blog$ gcc -Wall main-3-pid.c -o ns && sudo ./ns
 - [ 7823] Hello ?
 - [    1] World !
root@In Namespace:~/blog# kill -KILL 7823
bash: kill: (7823) - No such process
root@In Namespace:~/blog# exit
</pre>

The isolation is working as expected. And, as written earlier, this behaves much like a &#8220;chroot&#8221; meaning that with a &#8220;top&#8221; or &#8220;ps exf&#8221; from the parent process will show the child process with its real un-mapped PID. This is an essential feature for process control like &#8220;kill&#8221;, &#8220;cgroups&#8221;, &#8230; and various policies.

Wait! Speaking of &#8220;top&#8221; and &#8220;ps exf&#8221;, I just ran them from the child and saw exactly the same as from the parent. You lied to me about isolation !

Well, not at all. This is because these tools get their informations from the virtual &#8220;/proc&#8221; filesystem which is not (yet) isolated. This is the purpose of the next article.

In the mean time, an easy workaround could be:

<pre class="brush: plain; highlight: [3,5]; title: ; notranslate" title=""># from child
root@In Namespace:~/blog# mkdir -p proc
root@In Namespace:~/blog# mount -t proc proc proc
root@In Namespace:~/blog# ls proc
1          dma          key-users      net            sysvipc
80         dri          kmsg           pagetypeinfo   timer_list
acpi       driver       kpagecount     partitions     timer_stats
asound     execdomains  kpageflags     sched_debug    tty
buddyinfo  fb           latency_stats  schedstat      uptime
bus        filesystems  loadavg        scsi           version
cgroups    fs           locks          self           version_signature
cmdline    interrupts   mdstat         slabinfo       vmallocinfo
consoles   iomem        meminfo        softirqs       vmstat
cpuinfo    ioports      misc           stat           zoneinfo
crypto     irq          modules        swaps
devices    kallsyms     mounts         sys
diskstats  kcore        mtrr           sysrq-trigger
</pre>

Everything seems reasonable again. As expected, you get PID &#8220;1&#8221; for /bin/bash itself and &#8220;80&#8221; corresponds to the running &#8220;/bin/ls proc&#8221; command. Much nicer to read than usual /proc, isn't it ? That's why I love it.

If you attempt to run this command directly on the &#8220;/proc&#8221; from the namespace, it will _seem_ to work in the child but BREAK your main namespace. Example:

<pre class="brush: plain; title: ; notranslate" title="">jean-tiare@jeantiare-Ubuntu:~/blog$ ps aux
Error, do this: mount -t proc proc /proc
</pre>

That's all for PID namespace. With the next article, we'll be able to re-mount /proc itself and hence fix &#8220;top&#8221; and any similar tools without breaking the parent namespace. Thanks for reading !

 [1]: https://blog.jtlebi.fr/2013/12/28/introduction-to-linux-namespaces-part-2-ipc/ "Introduction to Linux namespaces – Part 2: IPC"
 [2]: https://blog.jtlebi.fr/2013/12/22/introduction-to-linux-namespaces-part-1-uts/ "Introduction to Linux namespaces – Part 1: UTS"
 [3]: http://blog.lucode.net/linux/intro-Linux-namespace-3.html