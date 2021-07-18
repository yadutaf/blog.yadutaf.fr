---
title: 'Introduction to seccomp: BPF linux syscall filter'
author: Jean-Tiare Le Bigot
layout: post
date: 2014-05-29
url: /2014/05/29/introduction-to-seccomp-bpf-linux-syscall-filter/
categories:
  - Security
tags:
  - containers
  - linux
  - seccomp
  - security
---
Seccomp is basic yet efficient way to filter syscalls issued by a program. It is especially useful when running untrusted third party programs. Actually, it was first [introduced in linux 2.6.12][1] as an essential building block of [&#8220;cpushare&#8221; program][2]. The idea behind this project was to allow anyone with the proper agent installed to rent cpu cycles to third parties, without compromising its the security.

The initial implementation, also known as &#8220;mode 1 seccomp&#8221; only allowed &#8216;`read`&#8216;, &#8216;`write`&#8216;, &#8216;`_exit`&#8216; and &#8216;`sigreturn`&#8216; syscalls to be issued making it only possible to read/write to already opened files and to exit. It is also trivial get started with:

<pre class="brush: cpp; highlight: [2,3,10]; title: 01-nothing.c; notranslate" title="01-nothing.c">#include &lt;stdio.h&gt;         /* printf */
#include &lt;sys/prctl.h&gt;     /* prctl */
#include &lt;linux/seccomp.h&gt; /* seccomp's constants */
#include &lt;unistd.h&gt;        /* dup2: just for test */

int main() {
  printf("step 1: unrestricted\n");

  // Enable filtering
  prctl(PR_SET_SECCOMP, SECCOMP_MODE_STRICT);
  printf("step 2: only 'read', 'write', '_exit' and 'sigreturn' syscalls\n");
  
  // Redirect stderr to stdout
  dup2(1, 2);
  printf("step 3: !! YOU SHOULD NOT SEE ME !!\n");

  // Success (well, not so in this case...)
  return 0; 
}
</pre>

**Build, run, test:**

<pre class="brush: bash; title: ; notranslate" title="">gcc 01-nothing.c -o 01-nothing && ./01-nothing; echo "Status: $?"</pre>

**Output:**

<pre class="brush: plain; title: ; notranslate" title="">step 1: unrestricted
step 2: only 'read', 'write', '_exit' and 'sigreturn' syscalls
Processus arrêté
Status: 137        &lt;------ 128+9 ==&gt; SIGKILL
</pre>

See the return status ? Whenever a forbidden syscall is issued, the program is immediately killed.

While this is really cool, this is also somewhat over-restrictive. This is the reason why it saw such a little adoption. Linus Torvald even suggested to ax it out of the kernel!

Fortunately, since linux 3.5, it is also possible to define advanced custom filters based on the BPF (Berkley Packet Filters). These filters may apply on any of the syscall argument but only on their value. In other words, a filter won't be able to dereference a pointer. For example one could write a rule to forbid any call to &#8216;`dup2`&#8216; as long as it targets &#8216;`stderr`&#8216; (fd=2) but would not be able to restrict &#8216;`open`&#8216; to a given set of files neither bind to a specific interface or port number.

Once installed, each syscall is sent to the filter which tells what action to take:

  * `SECCOMP_RET_KILL`: Immediate kill with SIGSYS
  * `SECCOMP_RET_TRAP`: Send a catchable SIGSYS, giving a chance to emulate the syscall
  * `SECCOMP_RET_ERRNO`: Force `errno` value
  * `SECCOMP_RET_TRACE`: Yield decision to ptracer or set `errno` to `-ENOSYS`
  * `SECCOMP_RET_ALLOW`: Allow

Enough words. Let's allow the program to redirect its `stderr` to `stdout` but nothing else. Writing BPF directly is cumbersome and far beyond the scope of this post, we'll use the `libseccomp` helper to make the code easier to write&#8230; and read. Error checking stripped for brevity.

**Grab the library:**

<pre class="brush: bash; title: ; notranslate" title="">sudo apt-get install libseccomp-dev</pre>

**Write the code:**

<pre class="brush: cpp; title: 02-bpf-only-dup-sudo.c; notranslate" title="02-bpf-only-dup-sudo.c">#include &lt;stdio.h&gt;   /* printf */
#include &lt;unistd.h&gt;  /* dup2: just for test */
#include &lt;seccomp.h&gt; /* libseccomp */

int main() {
  printf("step 1: unrestricted\n");

  // Init the filter
  scmp_filter_ctx ctx;
  ctx = seccomp_init(SCMP_ACT_KILL); // default action: kill

  // setup basic whitelist
  seccomp_rule_add(ctx, SCMP_ACT_ALLOW, SCMP_SYS(rt_sigreturn), 0);
  seccomp_rule_add(ctx, SCMP_ACT_ALLOW, SCMP_SYS(exit), 0);
  seccomp_rule_add(ctx, SCMP_ACT_ALLOW, SCMP_SYS(read), 0);
  seccomp_rule_add(ctx, SCMP_ACT_ALLOW, SCMP_SYS(write), 0);
  
  // setup our rule
  seccomp_rule_add(ctx, SCMP_ACT_ALLOW, SCMP_SYS(dup2), 2, 
                        SCMP_A0(SCMP_CMP_EQ, 1),
                        SCMP_A1(SCMP_CMP_EQ, 2));

  // build and load the filter
  seccomp_load(ctx);
  printf("step 2: only 'write' and dup2(1, 2) syscalls\n");
  
  // Redirect stderr to stdout
  dup2(1, 2);
  printf("step 3: stderr redirected to stdout\n");

  // Duplicate stderr to arbitrary fd
  dup2(2, 42);
  printf("step 4: !! YOU SHOULD NOT SEE ME !!\n");

  // Success (well, not so in this case...)
  return 0; 
}
</pre>

**Build, run, test:**

<pre class="brush: bash; title: ; notranslate" title="">gcc 02-bpf-only-dup-sudo.c -o 02-bpf-only-dup-sudo -lseccomp && sudo ./02-bpf-only-dup-sudo; echo "Status: $?"</pre>

**Output:**

<pre class="brush: plain; title: ; notranslate" title="">step 1: unrestricted
step 2: only 'write' and dup2(1, 2) syscalls
step 3: stderr redirected to stdout
Appel système erroné
Status: 159        &lt;------ 128+31 ==&gt; SIGSYS
</pre>

Just as expected.

As you probably noticed, we ran the previous example as root which somewhat limits the security benefice of syscall filtering as we actually have MORE privileges than before&#8230;

This is where it really gets interesting: filters are inherited by child processes so that one could technically apply syscall filters to &#8216;sudo' and maybe defeat some of its security measures and gain root on the machine ? To prevent this, one must either be &#8216;`CAP_SYS_ADMIN`&#8216; (read: root), either explicitly accept to never get any more privileges. For example the &#8216;`setuid`&#8216; bit of &#8216;`sudo`&#8216; would not be honored.

This can easily be achieved by adding this snippet _before_ installing the filter:

<pre class="brush: cpp; title: ; notranslate" title="">prctl(PR_SET_NO_NEW_PRIVS, 1);</pre>

Another security note, remember the `SECCOMP_RET_TRACE` filter return value ? It instructs the kernel to notify the ptracer program, if any, to take the final decision. Hence the &#8220;secured&#8221; program could be run under a malicious ptracer possibly defeating the security measures. This is why another `prctl` is highly recommended to forbid any attempt to attach a ptracer:

<pre class="brush: cpp; title: ; notranslate" title="">prctl(PR_SET_DUMPABLE, 0);</pre>

Putting it all together we get:

<pre class="brush: cpp; title: 03-bpf-only-dup.c; notranslate" title="03-bpf-only-dup.c">#include &lt;stdio.h&gt;     /* printf */
#include &lt;unistd.h&gt;    /* dup2: just for test */
#include &lt;seccomp.h&gt;   /* libseccomp */
#include &lt;sys/prctl.h&gt; /* prctl */

int main() {
  printf("step 1: unrestricted\n");

  // ensure none of our children will ever be granted more priv
  // (via setuid, capabilities, ...)
  prctl(PR_SET_NO_NEW_PRIVS, 1);
  // ensure no escape is possible via ptrace
  prctl(PR_SET_DUMPABLE, 0);

  // Init the filter
  scmp_filter_ctx ctx;
  ctx = seccomp_init(SCMP_ACT_KILL); // default action: kill

  // setup basic whitelist
  seccomp_rule_add(ctx, SCMP_ACT_ALLOW, SCMP_SYS(rt_sigreturn), 0);
  seccomp_rule_add(ctx, SCMP_ACT_ALLOW, SCMP_SYS(exit), 0);
  seccomp_rule_add(ctx, SCMP_ACT_ALLOW, SCMP_SYS(read), 0);
  seccomp_rule_add(ctx, SCMP_ACT_ALLOW, SCMP_SYS(write), 0);
  
  // setup our rule
  seccomp_rule_add(ctx, SCMP_ACT_ALLOW, SCMP_SYS(dup2), 2, 
                        SCMP_A0(SCMP_CMP_EQ, 1),
                        SCMP_A1(SCMP_CMP_EQ, 2));

  // build and load the filter
  seccomp_load(ctx);
  printf("step 2: only 'write' and dup2(1, 2) syscalls\n");
  
  // Redirect stderr to stdout
  dup2(1, 2);
  printf("step 3: stderr redirected to stdout\n");

  // Duplicate stderr to arbitrary fd
  dup2(2, 42);
  printf("step 4: !! YOU SHOULD NOT SEE ME !!\n");

  // Success (well, not so in this case...)
  return 0;
}
</pre>

**Build, run, test:**

<pre class="brush: bash; title: ; notranslate" title="">gcc 03-bpf-only-dup.c -o 03-bpf-only-dup -lseccomp && ./03-bpf-only-dup; echo "Status: $?"</pre>

**Output:**

<pre class="brush: plain; title: ; notranslate" title="">step 1: unrestricted
step 2: only 'write' and dup2(1, 2) syscalls
step 3: stderr redirected to stdout
Appel système erroné
Status: 159        &lt;------ 128+31 ==&gt; SIGSYS
</pre>

There we are: no more &#8220;sudo&#8221; to run it <img src="https://blog.jtlebi.fr/wp-includes/images/smilies/simple-smile.png" alt=":)" class="wp-smiley" style="height: 1em; max-height: 1em;" />

Linux's seccomp is an extremely powerful tool when dealing with untrusted program's on Linux. (who said in &#8220;shared hosting environment&#8221;?). And we only scratched its surface. Please, keep in mind that seccomp is only a tool and should be used in combination with other Linux's security building blocks such as [namespaces][3] and capabilities to unleash its full power.

Example applications:

  * prevent &#8220;virtual priv esc&#8221; -> clone && unshare CLONE\_NEW\_USER
  * prevent std{in,out,err} escape -> block `close`, `dup2`
  * restrict read/write to std{in,out,err}
  * change limits (rlimits)
  * &#8230; -> see man 2 syscalls for more ideas 😉

What you still can't do:
  
- filter base on filename: no pointer dereference
  
- filter base on port/ip: same reason

Going further:
  
- [libseccomp tests][4]
  
- kernel seccomp [documentation][5] and [samples][6] (low level BPF)
  
- ptrace interaction: overcome the &#8220;What you still can't do&#8221; section.

 [1]: http://git.kernel.org/cgit/linux/kernel/git/tglx/history.git/commit/?id=d949d0ec9c601f2b148bed3cdb5f87c052968554 "Initial seccomp commit"
 [2]: http://mashable.com/2005/12/21/cpushare-distributed-computing-marketplace/
 [3]: https://blog.jtlebi.fr/2013/12/22/introduction-to-linux-namespaces-part-1-uts/ "Introduction to Linux namespaces – Part 1: UTS"
 [4]: http://sourceforge.net/p/libseccomp/libseccomp/ci/master/tree/tests/
 [5]: https://www.kernel.org/doc/Documentation/prctl/seccomp_filter.txt
 [6]: https://github.com/torvalds/linux/tree/master/samples/seccomp