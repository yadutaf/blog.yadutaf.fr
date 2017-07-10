---
title: "Tracing a packet journey thanks to eBPF"
author: Jean-Tiare Le Bigot
layout: post
date: 2017-07-11
url: /2017/07/11/tracing-a-packet-journey-thanks-to-ebpf/
categories:
  - Sysadmin
tags:
  - linux
  - netns
  - docker
  - ebpf
---

If you do networking, you are used to long debugging sessions, firing up a couple of ``tcpdump``, ``mtr`` and ``*ping`` along the expected/actual packet journey. At least, when there is routing involved, ``mtr`` (or ``traceroute`` if you have no choice) does a good at showing what's going on. But not everything is L3. Since containers became popular on Linux, people found new 'exciting' ways to torture the networking subsystem with (powerful) virtual interfaces like veth, macvlan bridge, V(x)LAN, ... Add a bunch of network namespaces [**TODO LINK TO POST**] in the equation and debugging starts to get... interesting. If not excitingly frustrating.

When I was working for OVH, I designed a significant part of the inner networking of the next generation of Load Balancers. Without revealing trade secrets / announcing not-yet-if-ever-released products, I can tell that it involved a fair amount of network namespaces, virtual interfaces and truly nasty routing tricks (like routing via an interface with no IP and using ``dummy`` interfaces). At least, it did not involve multiple routing tables (at that time). For all this time, I whished I had a tool to trace a packet journey across the interfaces and network namespaces.

Latter, I was struggling with a network issue in a trivial 2 nodes Docker Swarm setup I use to play around [^play around]. Exactly half the connections timed out. It turned out to be the kind of bugs you end up fixing by rebooting... the other node. Frustrating. I whished I had a tool to trace a packet journey across the interfaces and network namespaces.

In such situation, one usually ends up checking manually each possible ip route, ip table, iptables, iptables tables (!) in each possible network namespace / vrf, possibly firing a couple of tcpdumps as an attempt to make sense of the problem. Feels like a maze. At least, it does to me. You have to guess a path, check it, rinse, repeat. At least, in an actual maze, you can cheat by looking from above. ``tcpdump`` would be a good tool even though tracing is not the area where it excels. To get the "view from above", you could make it listen on the special "any" interface. But that won't help when using multiple network namespaces. You'd need 1 tcpdump instance per network namespace. Doable. But cumbersome.

### The solution: Enter eBPF

Then, it hit me. When I wrote the solisten.py [**TODO LINK TO POST**] tool to notify whenever a programs starts to listen on any network interface, in any network namespace, I used eBPF to hook on the main listen function in the kernel (inet_listen [**TODO LINK TO KERNEL SOURCE**]) and send events. Maybe we can do the same to trace a packet? Sounds reasonable!

Let's define the problem. We want to:

* Trace a packet journey in the kernel, on a single node
* List all crossed interface
* List all crossed network namespace

Ok, now that the problem is defined, this looks more like a trackable problem. Let's translate these goals to needs. We need to:

* Use bcc [**TODO LINK TO BCC PROJECT**]. It comes with a C to eBPF compiler and a Python API. Seems reasonable for prototyping.
* Trace ping packets. They are well known, have no side effect, contain an "identifier" and "sequence" field.
* Find a function that is (almost) always called when a packet is queued on an interface. That would solve the "all crossed interface and network namespace".

To keep things simple, distributed, TCP and UDP tracing are out of the scope. That would be perfectly feasible, but that would also be over-engineering in that specific case. Additionally, even though I did my proof of concept with IPv6 and IPv4 support, I'll focus exclusively on IPv4 in the post for the sake of readability and link to the final code at the end of this post for curious people [**TODO LINK TO THE FULL CODE**].

### Find a function to trace

We need a good function to trace. Long story short, we'll use ``dev_hard_start_xmit`` on Linux 4.10 [**TODO LINK**] for the sake of this post. This may not be the best / perfect pick. But it does the job.

As digging in the kernel source may seem intimidating, I'd like to broadly re-trace the process of finding one, in the hope it can help you find one next time you need to.

There are some constraints. We need a function that is never inlined. If it is inlined, it is potentially present in all the calling site and maybe optimized away. Moreover, it can not be a "static" function. Static functions are basically the C equivalent of private function in most languages. All in all, if the candidate is not present in ``/proc/kallsyms``, it won't work. Some of them are special and can't be traced either, but we'll leave it aside.

Additionally, if possible, we'd prefer a function that is common to all or most of the devices and code path to limit the number of functions to trace. This is not a hard constraint, but that would surely help!

As I add no clue behind looking into "/net", I started from the veth driver. It looked like a reasonable candidate to start. This is a reasonably simple virtual driver, there should not be too much noise in it. Use 'find' to locate it and there you are http://elixir.free-electrons.com/linux/v4.10.17/source/drivers/net/veth.c. Around 500 lines of code. For the kernel, that's pretty small. Nice. Now, we need to check the functions in this file, looking for some good looking name. A good looking name would suggest that this function queues or forwards a packet on this interface. Good news, there is a single candidate, "vethxmit" http://elixir.free-electrons.com/linux/v4.10.17/source/drivers/net/veth.c#L106. As this is a driver, if this function is actually the one used by to enqueue packets, it will be registered somewhere and called via a function pointer. This the kernel's way to interfaces. A few lines below, it is registered under the name 'ndo_start_xmit' http://elixir.free-electrons.com/linux/v4.10.17/source/drivers/net/veth.c#L291.

Some 'grep' later, we learn that ``ndo_start_xmit()`` is mostly called from ``__netdev_start_xmit`` in http://elixir.free-electrons.com/linux/v4.10.17/source/include/linux/netdevice.h. There are 2 other call sites but they are related to usb and infiniband. We'll ignore them for now. Bad news is, this is a static inline function. We'll need another candidate.

This function is called from a couple of places [http://elixir.free-electrons.com/linux/v4.10.17/ident/netdev_start_xmit]. There are multiple good candidates here. I guess we'd need to trace at least a couple of them. But we'll start with the most likely candidate and maybe add more later. We'll go for ``xmit_one`` in http://elixir.free-electrons.com/linux/v4.10.17/source/net/core/dev.c#L2905. Unfortunately, this function is static, hence private, hence untraceable. On the bright side, it's static so we know all call sites must be in the same module. In our case, there is a single call place in ``dev_hard_start_xmit`` http://elixir.free-electrons.com/linux/v4.10.17/source/net/core/dev.c#L2922. a quick grep in ``/proc/kallsyms`` confirms this simple is exported: we have our candidate!

### Install bcc

If you already have it installed or are not intending to experiment (yet) on this PoC, you can safely skip this section. I should probably just skip it entirely anyway but install instruction are not exactly up to date. Hence, here is an updated, quick and dirty (tm) procedure for Ubuntu 17.04 (Zesty).

```bash
# Install dependencies
sudo apt install bison build-essential cmake flex git libedit-dev python zlib1g-dev libelf-dev libllvm4.0 llvm-dev libclang-dev luajit luajit-5.1-dev

# Grab the sources
git clone https://github.com/iovisor/bcc.git

# Build and install
mkdir bcc/build
cd bcc/build
cmake .. -DCMAKE_INSTALL_PREFIX=/usr
make
sudo make install
```

On Ubuntu 16.10 (Xenial) and older, install llvm3.7 instead.

### Trace ``dev_hard_start_xmit`` using bcc

That's the fun part. We'll attach a kernel probe (kprobe, you guessed it :)) to ``dev_hard_start_xmit`` and start building some events from the probe. Then we'll use a piece of simple Python code to parse these events and print some info.

Even though probes look like regular C and is indeed build using a LLVM C compiler, this is only a restricted subset of C that compiles to eBPF. That is, a simple VM inside the kernel designed to allow safe observers (ie: not actors / modifiers) to look around, provided the meet some criterions. First, most loops won't be allowed, the kernels needs to prove the program will always exit before starting it. Second, this is an observing program. You can not call arbitrary kernel functions for obvious security reasons. Some inline accessors defined in ".h" files are OK though. Third, you can not access memory outside the probe stack. If you need to do so, you need to be explicit about it and use bpf accessors. More on this later.

With this in place, we can proceed with a hello world probe. We'll simply emit an event for each packet sent (don't run it on a production system!). This event will only contain the owning programm name.

```c
#include <bcc/proto.h>
#include <linux/sched.h>

// Event structure
struct route_evt_t {
    char comm[TASK_COMM_LEN];
};
BPF_PERF_OUTPUT(route_evt);

int kprobe__dev_hard_start_xmit(struct pt_regs *ctx, struct sk_buff *first, struct net_device *dev, struct netdev_queue *txq, int *ret)
{
    // Built event for userland
    struct route_evt_t evt = {};
    bpf_get_current_comm(evt.comm, TASK_COMM_LEN);

    // Send event to userland
    route_evt.perf_submit(ctx, &evt, sizeof(evt));

    return 0;
};
```

Let's look at what it does.

1. Grab some definitions, just like a regular C program
2. Declare out event structure (``struct route_evt_t``) and channel name (``BPF_PERF_OUTPUT(route_evt)``)
3/ Declare our probe (``kprobe__dev_hard_start_xmit``). Notice the ``kprobe__`` prefix and ``struct pt_regs *ctx`` argument. bcc automatically detects the prefix and attaches it to the proper kernel function and will pass the context as first argument.
4/ Use a special bpf helper function (``bpf_get_current_comm``) to load the program name into the event structure. This is one of the rare function that can be called from eBPF!
5/ Send the event (``route_evt.perf_submit()``)

We can now integrate it in a simple Python program:

```python
#!/usr/bin/env python
# coding: utf-8

from socket import inet_ntop
from bcc import BPF
import ctypes as ct

bpf_text = '''<SEE CODE SNIPPET ABOVE>'''

TASK_COMM_LEN = 16 # linux/sched.h

class RouteEvt(ct.Structure):
    _fields_ = [
        ("comm",    ct.c_char * TASK_COMM_LEN),
    ]

def event_printer(cpu, data, size):
    # Decode event
    event = ct.cast(data, ct.POINTER(RouteEvt)).contents

    # Print event
    print "Just go a packet from %s" % (event.comm)

if __name__ == "__main__":
    b = BPF(text=bpf_text)
    b["route_evt"].open_perf_buffer(event_printer)

    while True:
        b.kprobe_poll()
```

I won't go too much into the details, here, this is mostly self-explanatory. This is basically te mirror of the setup on the eBPF side. Declare the event structure using ctypes to decode it, declare the probe, listen for events and print them.

If you run this program (as root), you'll probably see something like:

```
Just go a packet from ping
Just go a packet from ping
Just go a packet from Socket Thread
Just go a packet from irq/46-iwlwifi
```

You'll notice that I have a ping running in the background and using WiFi. So you can rightfully guess I'm typing from this from my laptop. Indeed, eBPF is not reserved to datacenters :)

### Load interface name, netns id from IPv4 packets

Once the plumbing is in place this is straightforward. If we can call straightforward to parse network packets from kernel structures :p. In this section, I'll focus on ``kprobe__dev_hard_start_xmit`` in the C/eBPF part of the probe. The structure and Python part can be easily extended. I'll put a link to a complete version at the end of the post.

We'll start by keeping only IPv4 packets:

```c
// Cast types. Intermediate cast not needed, kept for readability
struct sock *sk = first->sk;

// Filter IPv4 packets
if (sk->sk_family != AF_INET) {
	return 0;
}
```

Here, there is no choice, you need to read the structure definitions in the kernel. Fortunately, this is one of the most active and documented subsystem of Linux.

While dealing with ``sk``, we can grab the network namespace internal identifier. This will not give you a pretty name like ``ip netns`` does, that's only a magic trick. Rather, it will return the numerical part of what you can see when using ``readlink`` on some ``/proc/[PID]/ns/net`` pseudo file.

```c
// Get netns id
evt.netns = sk->sk_net.net->ns.inum;
```

Granted, this may require quite a bit of detective work to find! While we are at the low hanging fruits, we can load the interface name into the event structure as well, from the device:

```c
// Get interface name
bpf_probe_read(&evt.ifname, IFNAMSIZ, dev->name);
__builtin_memcpy(&evt.ifname, dev->name, IFNAMSIZ);
```

Notice the ``bpf_probe_read`` function. This is the helper to use when reading data. It will handle the memory safety checks for you so that the kernel can trust your code, even though it may access memory outside the eBPF stack. Alternatively, you could use ``__builtin_memcpy`` as well. Actually, this is what I used initially. But it feels hackish. Failing to do so may result in strange build errors like "error: extraneous closing brace ('}')" if you used the more familiar "memcpy" or "Permission Denied" from the kernel if it failed to prove safe memory access at validation time, before your code even get a chance to run.

### Keep only ICMP echo request (ping) and echo replies

With these gratifying low hanging fruits in hands, we can focus on the packet itself. Depending on you point of view when reading this post, it may seem trivial or... disheartening, wondering how one can find the necessary fields and offsets. I generally fall into the second category. That's OK. You may use kernel structures for IP and ICMP to guess the fields and Wikipedia has really high quality pages about these foundation protocols.

Enough talking. Let's get started. First, step, some grounding work. Let's compute the IPv4 and ICMP headers addresses:

```c
// Pre-Compute header addresses
char* ip_header_address   = first->head + first->network_header;
char* icmp_header_address = first->head + first->transport_header;
```

Notice the manual inlining of ``skb_network_header()`` and ``skb_transport_header()``. Although both are static inline, we can unfortunately not use them here. If we do, the kernel will complain about "R1 invalid mem access 'inv'". I suspect this is a compiler glitch as the code are strictly equivalent. Keep in mind eBPF and it's bcc frontends are quite recent additions.

On the a side note, I accidentally lost quite some time using ``first->data`` instead of ``first->head``. The former is the head of the buffer from which all offsets are computed, while the later is the offset of the first "meaningful" byte in the buffer.

Then, load the IP header and filter ICMP packets only, using the next ``protocol`` field from the IPv4 header. We'll use the kernel's ``struct iphdr`` definition to get the offsets right:

```c
// Filter ICMP packets
struct iphdr* iphdr = (struct iphdr*)ip_header_address;
if (iphdr->protocol != IPPROTO_ICMP) {
	return 0;
}
```

You may wonder why I did not write the more compact ``struct iphdr* iphdr = (struct iphdr*)(first->head + first->network_header)``. This is the same reason as above. The generated code would fail to pass the kernel validation phase. As it generally helps with bcc, I split the statements into smaller ones to help the verifier.

We can now do the same with the ICMP header and keep only ICMP echo request and ICMP echo replies:

```c
// Filter ICMP echo request and echo reply
struct icmphdr* icmphdr = (struct icmphdr*)icmp_header_address;
if (icmphdr->type != ICMP_ECHO && icmphdr->type != ICMP_ECHOREPLY) {
	return 0;
}
```

Last but not least: load relevant data into the event.

```c
// Get address and icmp info
evt.saddr    = iphdr->saddr;
evt.daddr    = iphdr->daddr;
evt.icmptype = icmphdr->type;
evt.icmpid   = icmphdr->un.echo.id;
evt.icmpseq  = icmphdr->un.echo.sequence;

// Fix endian
evt.icmpid  = be16_to_cpu(evt.icmpid);
evt.icmpseq = be16_to_cpu(evt.icmpseq);
```

And we're done! We now have an event ready to send to user space with all relevant information.

Note: If you intend to add IPv6 support, please note that the ICMP protocol number is NOT the same as with IPv4 and echo request/replay have different op codes, even though the general packet structure looks similar. I lost quite some time on this...

### Show time

With some trivial Python to handle the event, we can test it in a couple of scenarios. Start the program as root, launch some "ping" in another terminal and observe:

```
# ping -4 localhost
[  4026531957]               lo request #32693.001 127.0.0.1 -> 127.0.0.1
[  4026531957]               lo   reply #32693.001 127.0.0.1 -> 127.0.0.1
[  4026531957]               lo request #32693.002 127.0.0.1 -> 127.0.0.1
[  4026531957]               lo   reply #32693.002 127.0.0.1 -> 127.0.0.1
[  4026531957]               lo request #32693.003 127.0.0.1 -> 127.0.0.1
[  4026531957]               lo   reply #32693.003 127.0.0.1 -> 127.0.0.1
```

We clearly see the first 3 ping sent the process 32693 (the ICMP id on Linux's ping) on the loopback interface as well as the generated reply. Mission accomplished!

What about some external "random" target IP?

```
# ping -4 google.com
[  4026531957]           wlp2s0 request #31348.001 192.168.1.11 -> 216.58.198.206
[  4026531957]           wlp2s0 request #31348.002 192.168.1.11 -> 216.58.198.206
[  4026531957]           wlp2s0 request #31348.003 192.168.1.11 -> 216.58.198.206
[  4026531957]           wlp2s0 request #31348.004 192.168.1.11 -> 216.58.198.206
[  4026531957]           wlp2s0 request #31348.005 192.168.1.11 -> 216.58.198.206
```

We clearly see the 5 first pings sent via my WiFi interface from my home network to Google. Interestingly, we don't see the reply here. This is probably due the hypothesis we did above when choosing a function to trace. We certainly should add some tracing points to be exhaustive, but the general principle says the same. The point is proven !

And my personal favorite: let's ping a Docker container:

```
# ping -4 172.17.0.2
[  4026531957]          docker0 request #01952.001 172.17.0.1 -> 172.17.0.2
[  4026531957]      veth0e65931 request #01952.001 172.17.0.1 -> 172.17.0.2
[  4026532395]             eth0   reply #01952.001 172.17.0.2 -> 172.17.0.1
```

Like the Google example, this is not perfect BUT we do see the change of network namespace and can reasonably guess that the packet journey goes:

```
       Host netns           | Container netns
+---------------------------+-----------------+
| docker0 ---> veth0e65931 ---> eth0          |
+---------------------------+-----------------+
```

### Final word

eBPF can be used to instrument the kernel and trace the journey of an arbitrary bit of information in the kernel. I would not pretend this is a "quick way" to instrument the kernel. It's not. And the C-like language limitations can feel frustrating at first. But once this initial frustration step is over, this is an extremely powerful tool. I hope this post gave you a good taste of it and helped ease the initial journey in eBPF. I intentionally pasted full error messages in this post in the hope they may be indexed and help you if you meet them (and you will ^^).

As far as this demo is concerned, it would benefit from additional tracing point. Some packets are clearly missing. It would also be interesting to instrument the routing and filtering phases to better help troubleshoot common routing issues.

I did not measure the performance impact. I know there is one. Kernel probes work by inserting jumps in the kernel on tracing points. This tracing point ends up being called for each packet. On production system that would mean a *LOT*. It should not matter. I would not install LLVM and a build toolchain a production system for the sole sake of debugging anyway!

As promised, the full code for this post is available on Github, with IPv4 and IPv6 support: https://github.com/yadutaf/tracepkt

[^play around]: That is, if by "play around" you mean "host a hobby application with literally 10s of thousands clients syncing on a daily basis".
