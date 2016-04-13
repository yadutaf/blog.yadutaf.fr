---
title: 'Introduction to Linux namespaces – Part 5: NET'
author: Jean-Tiare Le Bigot
layout: post
date: 2014-01-19
url: /2014/01/19/introduction-to-linux-namespaces-part-5-net/
categories:
  - Security
  - Sysadmin
tags:
  - linux
  - namespace
---
Following the [previous post on PID namespace][1] (Restart process numbering to &#8220;1&#8221;), would like to go further and fly eve closer to full-featured VMs ? Great ! The two last posts of this series will precisely focus on this. Isolate network interfaces with the &#8220;NET&#8221; namespace (Yes, really) and user/group identifier for even more transparency. If you haven't done so already, I encourage you to read [the first post of this series for an introduction to linux namespace isolation mechanism][2].

[EDIT 2014-01-08] A Chinese translation of this post is available [here][3]

For once we won't start with the addition of the &#8220;CLONE_NEWNET&#8221; flag to the &#8220;clone&#8221; syscall. I keep it for later. For now, IMHO, the best way to get started with this namespace is the incredibly mighty &#8220;[iproute2][4]&#8221; net-admin swiss army knife. If you don't have it (yet) I highly encourage you to install it. Nonetheless, if don't want to / can't, you may as well skip the explanation part and go straight to the full code sample.

First, let's see what network interfaces we have at the moment:

<!--more-->

<pre class="brush: bash; title: ; notranslate" title="">ip link list</pre>

Which outputs something like:

<pre class="brush: plain; title: ; notranslate" title="">1: lo: &lt;LOOPBACK,UP,LOWER_UP&gt; mtu 65536 qdisc noqueue state UNKNOWN mode DEFAULT
    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00
2: eth0: &lt;NO-CARRIER,BROADCAST,MULTICAST,UP&gt; mtu 1500 qdisc pfifo_fast state DOWN mode DEFAULT qlen 1000
    link/ether **:**:**:**:**:** brd ff:ff:ff:ff:ff:ff
3: wlan0: &lt;BROADCAST,MULTICAST,UP,LOWER_UP&gt; mtu 1500 qdisc mq state UP mode DORMANT qlen 1000
    link/ether **:**:**:**:**:** brd ff:ff:ff:ff:ff:ff
# ...
</pre>

Nothing unexpected here. I have a working loopback, UP (Yeah, &#8216;UNKNOWN' means &#8216;UP'&#8230;) and am connected to my wireless network + a couple of extra connections eclipsed for this article.

Now, let's create a network namespace and run the same from inside:

<pre class="brush: bash; title: ; notranslate" title=""># create a network namespace called "demo"
ip netns add demo
# exec "ip link list" inside the namespace
ip netns exec demo ip link list
</pre>

Output is now:

<pre class="brush: plain; title: ; notranslate" title="">1: lo: &lt;LOOPBACK&gt; mtu 65536 qdisc noop state DOWN mode DEFAULT
    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00
</pre>

Huuu, not only is there only a loopback but also it is &#8220;DOWN&#8221;. Even more interesting, it is fully isolated from the main loopback. That is to say, any application inside the namespace binding on &#8220;the&#8221; loopback would only be able to communicate with applications inside the same namespace. Exactly the same level of isolation as with the IPC namespace. Neat, isnt't ?

Right, but how do I communicate with the interwebz now ?

There are multiple solutions. The easiest and most common one is to create a Point-to-Point tunnel between your &#8220;Host&#8221; and &#8220;Guest&#8221; system. Once, again, the Linux Kernel provides multiple alternatives. I recommend to use the &#8220;veth&#8221; interfaces as these are the best integrated in the ecosystem especially with iproute2. This is also an extremely well tested piece of code as it is used by LXC and actually comes from the [OpenVZ project][5]. Another alternative could be the &#8220;etun&#8221; driver. It conceptually is the same with another name but I'm not aware of any project using it.

Both &#8220;veth&#8221; and &#8220;etun&#8221; create a pair of virtual interfaces linked on with the other in the current namespace. You can then pick one and move it in the target namespace to get a communication channel. You could think of it as intricate particles if it makes it easier to understand ;).

The next step is to give them an IP, set them up and ping ! Here is an example bash session doing just that:

<pre class="brush: bash; title: ; notranslate" title=""># Create a "demo" namespace
ip netns add demo

# create a "veth" pair
ip link add veth0 type veth peer name veth1

# and move one to the namespace
ip link set veth1 netns demo

# configure the interfaces (up + IP)
ip netns exec demo ip link set lo up
ip netns exec demo ip link set veth1 up
ip netns exec demo ip addr add 169.254.1.2/30 dev veth1
ip link set veth0 up
ip addr add 169.254.1.1/30 dev veth0
</pre>

That's it ! Nothing scary.

If you need to get Internet access from the &#8220;guest&#8221; system using the &#8220;veth&#8221; technique, you could setup masquerding, commonly known as &#8220;NAT&#8221;. In the same way, to make a webserver listening on the :80 inside the namespace appear to listen directly on the main interface, one could use &#8220;DNAT&#8221; commonly known as port &#8220;forwarding&#8221;. I'll leave this up to the reader.

Here is a basic example to quickly get started:

<pre class="brush: bash; title: ; notranslate" title=""># make sure ip forwarding is enabled
echo 1 &gt; /proc/sys/net/ipv4/ip_forward
# enable Internet access for the namespace, assuming you ran the previous example
iptables -t nat -A POSTROUTING -i veth0 -j  MASQUERADE
# Forward main ":80" to guest ":80"
iptables -t nat -A PREROUTING -d &lt;your main ip&gt;/32 -p tcp --dport 80 -j  DNAT --to-destination  169.254.1.2:80
</pre>

Now let's put it all together and finally append the `CLONE_NEWNET` flag to the `clone` syscall. For the sake of simplicity we'll simply stick with direct calls to &#8220;ip&#8221; using the `system()` syscall.

<pre class="brush: cpp; highlight: [9,40,41,42,57,60,61,62,63,64,65,66]; title: main-5-net.c; notranslate" title="main-5-net.c">#define _GNU_SOURCE
#include &lt;sys/types.h&gt;
#include &lt;sys/wait.h&gt;
#include &lt;sys/mount.h&gt;
#include &lt;stdio.h&gt;
#include &lt;sched.h&gt;
#include &lt;signal.h&gt;
#include &lt;unistd.h&gt;
#include &lt;stdlib.h&gt;

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

  // wait for network setup in parent
  read(checkpoint[0], &c, 1);

  // setup network
  system("ip link set lo up");
  system("ip link set veth1 up");
  system("ip addr add 169.254.1.2/30 dev veth1");

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
      CLONE_NEWUTS | CLONE_NEWIPC | CLONE_NEWPID | CLONE_NEWNS | CLONE_NEWNET | SIGCHLD, NULL);

  // further init: create a veth pair
  char* cmd;
  asprintf(&cmd, "ip link set veth1 netns %d", child_pid);
  system("ip link add veth0 type veth peer name veth1");
  system(cmd);
  system("ip link set veth0 up");
  system("ip addr add 169.254.1.1/30 dev veth0");
  free(cmd);

  // signal "done"
  close(checkpoint[1]);

  waitpid(child_pid, NULL, 0);
  return 0;
}
</pre>

Let's give it a test run !

<pre class="brush: bash; title: ; notranslate" title="">jean-tiare@jeantiare-Ubuntu:~/blog$ gcc -Wall main.c -o ns && sudo ./ns
 - [22094] Hello ?
 - [    1] World !
root@In Namespace:~/blog$ # run a super-powerful server, fully isolated
root@In Namespace:~/blog$ nc -l 4242
Hi !
Bye...
root@In Namespace:~/blog$ exit
jean-tiare@jeantiare-Ubuntu:~/blog$ # done !
</pre>

This is what you would have seen if, from another terminal, you had:

<pre class="brush: bash; title: ; notranslate" title="">jean-tiare@jeantiare-Ubuntu:~$ nc 169.254.1.2 4242
Hi !
Bye...
jean-tiare@jeantiare-Ubuntu:~$
</pre>

To go further on the path to network virtualization, you could have a look at new interfaces types recently introduced in the Linux kernel: macvlan, vlan, vxlans, &#8230;

If you feel that running a bunch of `system()` calls into a production system is a dirty hack (and it is !), you could have look at the `rtnetlink` kernel communication interface. This is the barely documented API used by iproute under the hood.

That's all for &#8220;NET&#8221; namespace. It's so powerful that it's used as the foundation of the [&#8220;CORE&#8221; lightweight network simulator][6]. With the next article we'll explore the last and most tricky namespace &#8220;USER&#8221;. Thanks for reading !

 [1]: https://blog.jtlebi.fr/2014/01/12/introduction-to-linux-namespaces-part-4-ns-fs/ "Introduction to Linux namespaces – Part 4: PID"
 [2]: https://blog.jtlebi.fr/2013/12/22/introduction-to-linux-namespaces-part-1-uts/ "Introduction to Linux namespaces – Part 1: UTS"
 [3]: http://blog.lucode.net/linux/intro-Linux-namespace-5.html
 [4]: http://www.linuxfoundation.org/collaborate/workgroups/networking/iproute2 "IPRoute2 official website"
 [5]: http://openvz.org "OpenVZ offical website"
 [6]: http://cs.itd.nrl.navy.mil/work/core/index.php