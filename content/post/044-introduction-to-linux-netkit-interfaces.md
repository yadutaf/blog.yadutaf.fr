---
title: "Introduction to Linux Netkit interfaces — with a grain of eBPF"
author: Jean-Tiare Le Bigot
layout: post
date: 2025-07-01
url: /2025/07/01/introduction-to-linux-netkit-interfaces-with-a-grain-of-ebpf/
categories:
  - Sysadmin
tags:
  - linux
  - network
  - eBPF
---

If you are reading this, chances are you are already familiar with Linux's `veth`
interfaces. If not, you can think of it as a virtual Ethernet cable for Linux
which is capable of crossing a network namespace (`netns`) boundary. In other
words, it is one of the fundamental building blocks of containers like Docker,
Podman and many others.

`netkit` interfaces can do exactly the same. And, well, they can actually
do *less*. And this is the beauty of it.

### Less is more

Wait, how is doing *less* supposed to be better in the first place ?

`netkit` interfaces are performance oriented. The key for performance is not
much what you can do, but how few you can do in order to do *more* of it. This is
precisely the spirit of the design followed by Isovalent, the main company
behind the Cilium Kubernetes CNI, when proposing this new interface family for
inclusion in the Linux kernel back in 2023. Namely:

* Operate in L3 (IP level) by default. This allows skipping the "L2" (Ethernet level)
  of the OSI model, and the associated overhead. If needed, L2 mode can me enabled
  when creating the interface pair.
* Delegate advanced behavior to eBPF programs. This allows to only keep the bare
  minimum code in the packet transmission path. If any feature or filter is needed,
  it can be done via an eBPF program.
* Grant control to the host / primary interface. This allows to control both sides
  of the interface from the host while guaranteeing that the container side will
  never be able to accidentally (?) attach or detach programs on its side.

If this sounds exciting to you, so is it for me. So let's get started. In this post
I'll show how to create an interface pair using standard iproute2 commands and then
how to create a "blackhole" `netkit` interface pair and programmatically allow traffic
using eBPF and Cilium's eBPF library for Go.

### `netkit`'s "Hello World"

The documentation is scarce, there is not much of it beside a terse entry in
`man ip link` and mentions in the kernel tests. Fortunately, `netkit` interfaces
are pretty similar to `veth` interfaces and we can easily fill in the gaps
with a bit of trial and error.

Let's create a 'lab' network namespace and connect it through a minimal `netkit`
interface pair:

```bash
# Create the 'lab' network namespace, to simulate a container
sudo ip netns add lab

# Create the netkit interface pair, with default settings (L3 mode, forward packets)
sudo ip link add nk-host type netkit peer name nk-container

# Move the container side of the interface pair, configure networking, ... business as usual
sudo ip netns exec lab ip link set lo up
sudo ip link set nk-container netns lab
sudo ip netns exec lab ip addr add 10.42.0.2/24 dev nk-container
sudo ip netns exec lab ip link set lo up
sudo ip netns exec lab ip link set nk-container up
sudo ip addr add 10.42.0.1/24 dev nk-host
sudo ip link set nk-host up
```

If it looks very similar to the creation of a `veth` pair, that's because it is exactly
the same invocation, with the exception of the "type".

Oh, and by the way: yes, we can ping one side from the other *by default*, and no, it will
not produce any FIB (Layer 2) entries:

```bash
ping -c3 10.42.0.2
```
```
PING 10.42.0.2 (10.42.0.2) 56(84) bytes of data.
64 bytes from 10.42.0.2: icmp_seq=1 ttl=64 time=0.057 ms
64 bytes from 10.42.0.2: icmp_seq=2 ttl=64 time=0.080 ms
64 bytes from 10.42.0.2: icmp_seq=3 ttl=64 time=0.042 ms

--- 10.42.0.2 ping statistics ---
3 packets transmitted, 3 received, 0% packet loss, time 2029ms
rtt min/avg/max/mdev = 0.042/0.059/0.080/0.015 ms
```

We can check that this ping did not produce any FIB entries by running `ip neigh show dev nk-host`.
If L2 features are desirable for any reason, these can be enabled where creating the interface
by adding `mode l2` right after `type netkit`, but this is beyond the scope of this post.

Wait, wait... Did I emphasizes that "*by default*" we can ping one side from the other ?

Indeed, and that's really where this interface type shines. We can instruct the
kernel to "blackhole" (drop) all packets by default, unless told otherwise. This is very
similar in practice to what we could do with the `iptables` chains policies.

Since demonstrating an interface that drops all packets is not the most impressive, I'll
skip the long part where I created a pair with:

```
sudo ip link add nk-host type netkit blackhole peer blackhole name nk-container
```

And then demonstrated with interfaces counters that, tadaaaaa, packets are un-ceremoniously
dropped.

### eBPF enters the party

If you are reading this post, you are probably already familiar with eBPF. If not,
in a few words, eBPF is an extremely powerful way to extend to Linux Kernel behavior in
pre-defined location, without the need to write a custom Kernel module, nor the risk of
crashing the kernel. Typical applications range from network to tracing going through Linux
security modules and [even tiny drivers](https://docs.ebpf.io/linux/program-type/BPF_PROG_TYPE_LIRC_MODE2/).
But really, if you are getting started with eBPF, visiting https://ebpf.io/get-started/
might be a good place to start.

In this part, we'll setup a `netkit` pair in blackhole mode an attach a trivial program
that will then restore connectivity. You can think of this part as the "Netkit Getting
Started Guide" that I whish existed when experimenting with this interface.

And before I forget, I want to thank Albin Kerouanton who is a maintainer of Docker's libnetwork
and who was kind enough to [publish his own experimentation publicly on Github](https://github.com/akerouanton/netkit)
🙏. This post would have much harder to put together without his repository.

Enough talk, let's setup a clean 'lab', in blackhole mode this time:

```bash
# Reset the network namespace
sudo ip netns del lab
sudo ip netns add lab

# Create and setup the interface pair with both sides in blackhole mode
sudo ip link add nk-host type netkit blackhole peer blackhole name nk-container
sudo ip link set nk-container netns lab
sudo ip netns exec lab ip addr add 10.42.0.2/8 dev nk-container
sudo ip netns exec lab ip link set lo up
sudo ip netns exec lab ip link set nk-container up
sudo ip addr add 10.42.0.1/8 dev nk-host
sudo ip link set nk-host up
```

This really is the same setup as above, with the double "blackhole" addition. You can easily
convince yourself that it is dropping all packets with a ping and checking the interface
counters.

From there, I'll use Cilium's Go eBPF library to attach the program. One thing that I really
like with this library is that it offers all the plumbing to seamlessly build and embed the
eBPF program(s) in the controlling binary.

Let's start by getting all necessary dependencies (shamelessly assuming a recent Ubuntu):

```
sudo apt install llvm clang libbpf-dev linux-headers-amd64
```

And bootstrap a Go eBPF project:

```bash
# Init the module
go mod init hello-netkit
go mod tidy

# Get the code generator
go get github.com/cilium/ebpf/cmd/bpf2go
```

We can now create our `netkit.c` eBPF program. Beware, it is extremely complex:

```c
//go:build ignore

#include <linux/bpf.h>
#include <bpf/bpf_helpers.h>

char LICENSE[] SEC("license") = "GPL";

SEC("netkit/primary")
int netkit_primary(struct __sk_buff *skb) {
    return TCX_PASS;
}

SEC("netkit/peer")
int netkit_peer(struct __sk_buff *skb) {
    return TCX_PASS;
}
```

This C file defines 2 programs. The first one is meant to be attached on the primary (host)
side of the interface pair, and the second one is meant to be attached to the peer (container)
side. The only quirk here is that `NETKIT_PASS` is not defined and `TCX_PASS` is used instead.

Other possible actions are `TCX_DROP`, `TCX_NEXT` and `TCX_REDIRECT` but this is beyond the
scope of this post.

As advertised, the programs are not doing anything fancy, only restoring the forwarding
behavior. This however provides the necessary scaffolding for a real program.

Speaking of scaffolding, how do we load these programs in the kernel ?

There are 3 main steps involved:

1. Find the index of the target interface
2. Load the compiled programs into the Kernel
3. Link (attach) the loaded programs to the target interface

For the purpose of this demo, I'll get the name of the interface from the command line
and use the builtin `net.InterfaceByName()` to resolve it to the corresponding index:

```go
	// Get host interface name from the command line
	interfaceName := flag.String("interface", defaultInterfaceName, "Host side netkit interface")
	if interfaceName == nil || *interfaceName == "" {
		flag.Usage()
	}

	// Resolve the interface name to an interface index
	ifIndex, err := net.InterfaceByName(*interfaceName)
	if err != nil {
		panic(fmt.Errorf("could not resolve interface %s index: %w", *interfaceName, err))
	}

	fmt.Printf("Interface %s index is %d\n", *interfaceName, ifIndex.Index)
```

We then need some boilerplate to load the program into the Kernel. This is also were we
start to use Cilium's eBPF library.

```go
	// Load the programs into the Kernel
	collSpec, err := loadNetkit()
	if err != nil {
		panic(fmt.Errorf("could not load collection spec: %w", err))
	}

	coll, err := ebpf.NewCollection(collSpec)
	if err != nil {
		panic(fmt.Errorf("could not load BPF objects from collection spec: %w", err))
	}
	defer coll.Close()
```

`loadNetkit()` function is auto generated from `netkit.c` by `bpf2go`. This function
prepares the internal structures. The programs are then loaded in the Kernel by
`ebpf.NewCollection(collSpec)`. This step requires root access.

Once loaded into the kernel, we can attach the primary AND the peer programs to the
primary interface, using `ebpf.AttachNetkitPrimary` and `ebpf.AttachNetkitPeer` to
specify the target.

```go

	// Attach the program to the primary interface
	primaryLink, err := link.AttachNetkit(link.NetkitOptions{
		Program:   coll.Programs["netkit_primary"],
		Interface: ifIndex.Index,
		Attach:    ebpf.AttachNetkitPrimary,
	})

	if err != nil {
		panic(fmt.Errorf("could not attach primary prog %w", err))
	}
	defer primaryLink.Close()

	// Attach the program to the peer, directly from the host, via the primary
	peerLink, err := link.AttachNetkit(link.NetkitOptions{
		Program:   coll.Programs["netkit_peer"],
		Interface: ifIndex.Index,
		Attach:    ebpf.AttachNetkitPeer,
	})

	if err != nil {
		panic(fmt.Errorf("could not attach peer prog %w", err))
	}
	defer peerLink.Close()
```

Attaching the programs to the peer interface via the primary interface is a key feature
of netkit's interfaces. In a container scenario, this grants full and exclusive control
over the programs to the host. Any attempt to attach the programs on the peer instead of
the primary result in a "permission denied".

If you are interested in running this code, you can find the full code in
[this gist](https://gist.github.com/yadutaf/1615ddc0dc7e9a02a4781b872e34c222).

Last but not least, let's build and run it !

```
# Build
go run github.com/cilium/ebpf/cmd/bpf2go -go-package main -tags linux netkit netkit.c
go build

# Start a ping, and see it loose all packets
ping 10.42.0.2

# In another terminal, run the program
sudo ./hello-netkit
```

As soon as the eBPF programs are loaded, the pings start to flow to and from the container.
Terminating the demo program immediately unloads the eBPF programs and reverts to the default
blackhole policy. This holds true even on abrupt termination, or if the any of the
"defer stuff.Close()" clauses is forgotten.

### Conclusion

Netkit interfaces are a powerful, albeit hidden, addition to the Linux container building
blocks. Specifically built with eBPF and container use cases in mind, it does nothing but
the strict minimum and allows controlling the peer interface program's from the primary.

These interface also exhibit host-like network performance that were not shown in this
post. You can read more about it on [Isovalent's blog](https://isovalent.com/blog/post/cilium-netkit-a-new-container-networking-paradigm-for-the-ai-era/)
and [LWN](https://lwn.net/Articles/949960/).

If you are interested in more advanced examples, you can have a look at Albin Kerouanton's
[experimentation on Github](https://github.com/akerouanton/netkit).
