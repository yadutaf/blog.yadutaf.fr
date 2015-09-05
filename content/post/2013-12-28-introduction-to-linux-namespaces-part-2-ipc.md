---
title: 'Introduction to Linux namespaces - Part 2: IPC'
author: Jean-Tiare Le Bigot
layout: post
date: 2013-12-28
url: /2013/12/28/introduction-to-linux-namespaces-part-2-ipc/
categories:
  - Security
  - Sysadmin
tags:
  - linux
  - namespace
---
Following the [previous post on UTS namespace][1] (hostname isolation), we will now go deeper and look at a more security oriented namespace: IPC, Inter-Process Communications. If you haven't done so already, I encourage you to read [the first post of this series for an introduction to linux namespace isolation mechanism][1].

[EDIT 2014-01-08] A Chinese translation of this post is available [here][2] 

Activating the IPC namespace is only a matter of adding &#8220;CLONE_NEWIPC&#8221; to the &#8220;clone&#8221; call. It requires no additional setup. It may also be freely combined with other namespaces.

Once activated, you are free to create any IPC as usual, even named one, without any risk of collision with other applications. 
  
But, WAIT! My &#8220;parent process&#8221; is now isolated from my &#8220;child process&#8221; right ? What if I need to do some kind of communication between them ?

<!--more-->

That's a good question. A common use case for this is you need some additional setup from the parent before letting the child take full control. Fortunately, not everything is isolated and clone shares memory space with its parent so that you can still use:

  * signal
  * poll memory
  * sockets
  * use files and file-descriptors

Because of it's context changes, signaling is probably not the most practical one while polling memory is damn inefficient way of communicating !

If you don't plan to fully isolate the network stack, you could go with sockets. Same remark applies with filesystem. But, in the case of this series this is precisely what we intend to do: isolate everything, step by step.

A little known / rarely used solution is to watch events on a pipe pair. In fact this is the technique used (with no explanation) by Lennart Poettering in [Systemd's &#8220;nspawn&#8221;][3] command. This is an extremely powerful technique that I would like to introduce here. This is also the one we will rely upon in the next articles.

We first need to init a pair of pipes. Let's call them a &#8220;checkpoint&#8221;.

<pre class="brush: cpp; title: checkpoint-global-init.c; notranslate" title="checkpoint-global-init.c">// required headers: 
#include &lt;unistd.h&gt;

// global status:
int checkpoint[2];

// [parent] init:
pipe(checkpoint);
</pre>

The idea is to trigger a &#8220;close&#8221; event from the parent and wait for &#8220;EOF&#8221; to be received on the reading end, in the child. Something crucial to understand is that \*all\* writing file-descriptors must be closed for an EOF to be received. Hence, the first thing to do before waiting in the child is to close our own write fd copy.

<pre class="brush: cpp; title: checkpoint-child-init.c; notranslate" title="checkpoint-child-init.c">// required headers: 
#include &lt;unistd.h&gt;

// [child] init:
close(checkpoint[1]);
</pre>

Actual &#8220;signaling&#8221; is now straightforward: 

  1. close write fd in parent
  2. wait for EOF from child

<pre class="brush: cpp; title: checkpoint-signal.c; notranslate" title="checkpoint-signal.c">// required headers: 
#include &lt;unistd.h&gt;

// [child] wait:
char c; // stub char
read(checkpoint[0], &c, 1);

// [parent] signal ready code:
close(checkpoint[1]);
</pre>

If we put it together the first example on UTS namespace, it could look like:

<pre class="brush: cpp; highlight: [7,12,25,27,39,49]; title: main-2-ipc.c; notranslate" title="main-2-ipc.c">#define _GNU_SOURCE
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

  printf(" - World !\n");
  sethostname("In Namespace", 12);
  execv(child_args[0], child_args);
  printf("Ooops\n");
  return 1;
}

int main()
{
  // init sync primitive
  pipe(checkpoint);

  printf(" - Hello ?\n");

  int child_pid = clone(child_main, child_stack+STACK_SIZE,
      CLONE_NEWUTS | CLONE_NEWIPC | SIGCHLD, NULL);

  // some damn long init job
  sleep(4);
  // signal "done"
  close(checkpoint[1]);

  waitpid(child_pid, NULL, 0);
  return 0;
}
</pre>

As this requires advanced capabilities, this snippets needs root or equivalent privileges to run. Obviously, there is no need to keep &#8220;CLONE_NEWUTS&#8221; in this example. I kept it only to show that multiple namespaces may be used together.

That's all for IPC. IPC in itself is nothing complicated. It just becomes tricky when it comes to parent/child synchronization as we will do later. This is where the &#8220;pipe&#8221; technique comes as a handy solution. It actually works and is used in production.

The next article will be on my favorite one (as sysadmin): PID namespaces.

 [1]: https://blog.jtlebi.fr/2013/12/22/introduction-to-linux-namespaces-part-1-uts/ "Introduction to Linux namespaces – Part 1: UTS"
 [2]: http://blog.lucode.net/linux/intro-Linux-namespace-2.html
 [3]: http://cgit.freedesktop.org/systemd/systemd/tree/src/nspawn/nspawn.c "systemd nspawn - git"