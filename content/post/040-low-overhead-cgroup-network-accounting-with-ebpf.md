---
title: "Using eBPF per-CPU Cgroup local storage for low overhead accounting"
author: Jean-Tiare Le Bigot
layout: post
date: 2021-08-22
url: /2021/08/22/ebpf-cgroup-per-cpu-storage-low-overhead-accounting/
categories:
  - Sysadmin
tags:
  - linux
  - cgroup
  - ebpf
---

Linux eBPF ecosystem is growing fast with new features coming with every
release cycle. The spirit remains the same. At the core, eBPF is like
a safe way to script the Linux kernel by attaching to various pre-defines hooks
and exported functions. For kernel / user spaces communication, the eBPF comes
with various "map" types.

Every few kernel version, new "map" types are introduced or significantly
improved and 3 years ago ``BPF_MAP_TYPE_PERCPU_CGROUP_STORAGE`` was
introduced and is now available in recent distribution kernels.

I was intrigued by it and wanted to learn about it with a simple Cgroup
network throughput monitoring application. Typicaly the kind of real-world
use-case when running multiple workload on a resource-constrained machine.

It turns out I had a hard time understand how to use effectively and wrote this
article with the hope that it could help other people getting started with
per-CPU eBPF Cgroup local storage.

### Example presentation

This post, will use [Cilium's ebpf](https://github.com/cilium/ebpf)
library for the userland part. Similar results could be easily achieved in
[C using libbpf](https://github.com/libbpf/libbpf) or
[in Python using BCC](https://github.com/iovisor/bcc). The kernel side eBPF
should work with any other userland with no change.

To minitor the target Cgroup ingress and egress throughput, the demo program
will attach to the  ``cgroup_skb/ingress`` and ``cgroup_skb/egress`` Cgroup
eBPF hooks. Of course, resultt will be communicated to userland using a map
of type ``BPF_MAP_TYPE_PERCPU_CGROUP_STORAGE``.

To keep this post reasonably simple and focused on the eBPF portions,
this post will only monitor one specific hard-coded cgroup path.

### Boilerplate

This is the eBPF skeleton. It starts with a dummy comment kindly asking the go
compiler not to attempt compiling it by itself. This is then followed by
linux kernel and BPF helpers includes and by the license definition.

The license may soud superfluous but eBPF programs are subject to the same rule
as plain-c kernel modules. Typically, some symbol exports are subject to "GPL
only" (or compatible).

```c
// +build ignore

#include <stdbool.h>
#include <linux/bpf.h>
#include <bpf/bpf_helpers.h>
#include <netinet/ip.h>
#include <netinet/ip6.h>

// ---------------------------------------------
// -- The real program will be somewhere here --
// ---------------------------------------------

char __license[] __attribute__((section("license"), used)) = "MIT";
```

This program can be compiled with:

```shell
clang -g -Wall -Werror -O2 -emit-llvm -c bpf-accounting.bpf.c -o - | llc -march=bpf -filetype=obj -o bpf-accounting.bpf.o
```

Of course, Clang needs to be installed first.

This is now the Go skeleton. It is built around a setup phase and a monitoring
phase that will run once every second until "Ctrl+C" or ``TERM``-inated.

Make sure to adjust ``TARGET_CGROUP_V2_PATH`` to target the Cgroup V2 of
interest. The "/sys/fs/cgroup/unified" prefix may be different from systems to
systems. This one comes from a Ubuntu with Systemd still configured to use v1
Cgroup implementation as the main implementation.

``EBPF_PROG_ELF`` may also need adjustement if the eBPF part was not called
``bpf-accounting.bpf.c``.

```go
package main

import (
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/cilium/ebpf"
	"github.com/cilium/ebpf/link"
	"golang.org/x/sys/unix"
)

const (
	TARGET_CGROUP_V2_PATH = "/sys/fs/cgroup/unified/yadutaf" // <--- Change as needed for your system/use-case
	EBPF_PROG_ELF         = "./bpf-accounting.bpf.o"
)

func main() {
	log.Printf("Attaching eBPF monitoring programs to cgroup %s\n", TARGET_CGROUP_V2_PATH)

	// ------------------------------------------------------------
	// -- The real program initialization will be somewhere here --
	// ------------------------------------------------------------

	// Wait until signaled
	c := make(chan os.Signal, 1)
	signal.Notify(c, syscall.SIGINT)
	signal.Notify(c, syscall.SIGTERM)

	// Periodically check counters
	ticker := time.NewTicker(1 * time.Second)

out:
	for {
		select {
		case <-ticker.C:
			log.Println("-------------------------------------------------------------")

			// ------------------------------------------
			// -- And here will be the counters report --
			// ------------------------------------------

		case <-c:
			log.Println("Exiting...")
			break out
		}
	}
}
```

### Data structures

It is now time to introduce ``BPF_MAP_TYPE_PERCPU_CGROUP_STORAGE``. But first,
why not using the most typical and easier to use ``BPF_MAP_TYPE_HASH`` map
type ?

For this article's use case, ``BPF_MAP_TYPE_HASH`` would be a great fit.
However, if a real-world application needs to monitor all cgroups, dynamically
attach them as they are created or conversely cleanup associated resources when
a Cgroup is terminated then ``BPF_MAP_TYPE_CGROUP_STORAGE`` is likely a more
suitable choice. If, in addition, collected data may be accessed concurrently
from multiple CPUs then the per-CPU variant ``BPF_MAP_TYPE_PERCPU_CGROUP_STORAGE``
is the go-to choice to avoid spin-locks.

Technically, ``BPF_MAP_TYPE_PERCPU_CGROUP_STORAGE`` is actually a /virtual/ map
or more accurately a Cgroup *local storage* in the kernel's terminology.
Internaly, the Cgroup datastructure has a member dedicated to cgroup local
storage. Every program of given type will therefore share the *same* storage
area for a given Cgroup. By default, programs of different types will have a
dedicated storage area in the Cgroup. It is however possible to share this
storage area between all program types for a given Cgroup.

This has a couple of practical consequences:
1. By design, the (virtual) map key is conceptually a ``(cgroup_id, program_type)``
   tuple. This not be customised. The leaf member type is however flexible.
2. If multiple programs of the same type need to store data in the same Cgroup,
   have to cooperate for the leaf member type definition.
3. Programs may only access the storage area of the cgroup they are attached to.
   Sayed otherwise, a program attached to Cgroup ``foo`` will only access
   storage for Cgroup ``foo`` even if triggered by events in child Cgroup
   ``foo/bar``. If child Cgroup events needs to be specifically tracked, the
   same program needs to be attached to the Cgroup of insterest as well.

One last thing regarding ``BPF_MAP_TYPE_PERCPU_CGROUP_STORAGE``: Since this is
a *per-CPU* map type, the storage in the group is not directly the leaf member
type but a per-CPU array of this type. This is fully transparent to the eBPF
portion of the program which has only a view of the current cgroup + CPU. It 
will however require specific handling for the Go part which has a full view of
data stored for each cgroups + CPUs. 

For this article, there are 2 program types (``cgroup_skb/ingress`` and
``cgroup_skb/egress``) to match both incomming and outgoing traffic. Since the
goal is to measure the number of bytes transmitted in each direction, the leaf
member type can be as simple as an ``uint64``.

On the eBPF side, the structure declaration is as simple as:

```c
struct bpf_map_def SEC("maps") cgroup_counters_map = {
    .type = BPF_MAP_TYPE_PERCPU_CGROUP_STORAGE,
    .key_size = sizeof(struct bpf_cgroup_storage_key),
    .value_size = sizeof(__u64),
};
```

This defines eBPF map ``cgroup_counters_map`` of type ``BPF_MAP_TYPE_PERCPU_CGROUP_STORAGE``
with the imposed key type of ``struct bpf_cgroup_storage_key`` as defined in
'bpf.h' and a plain unsigned 64 bits integer as map member to hold the bytes
counter.

The Go side is a bit more involved, but nothing terrible. First, the programs
needs to increase the maximum "locked" memory. While this is not necessary for
this example, it is a common pitfall when starting with eBPF and using
real-world maps. Thus, here it is:

```go
	// Increase max locked memory (for eBPF maps)
	// For a real program, make sure to adjust to actual needs
	unix.Setrlimit(unix.RLIMIT_MEMLOCK, &unix.Rlimit{
		Cur: unix.RLIM_INFINITY,
		Max: unix.RLIM_INFINITY,
	})low-overhead-cgroup-network-accounting-with-ebpf
```

The compiled eBPF ELF file which now contains the map defintion must now be
loaded. This where Cilium's ebpf library shines. Under the hod, it parses
the ELF file and extracts the map definitions and all program metadata
"collection":

```go
	collec, err := ebpf.LoadCollection(EBPF_PROG_ELF)
	if err != nil {
		log.Fatal(err)
	}
```

Getting a handle on the map from the collection is then as trivial as:

```go
	// Get a handle on the statistics map
	cgroup_counters_map := collec.Maps["cgroup_counters_map"]
```

To actually access the map, the program needs the key and member type
definition. For the key, Cilium's library does not (yet) come with a
built-in definition. Since the key format is imposed by the Kernel's
ABI this is only a matter of translating ``struct bpf_cgroup_storage_key``
from the [kernel cgroup storage documentation](https://www.kernel.org/doc/html/latest/bpf/map_cgroup_storage.html)
to go with a dummy 32 bits field at the end for alignement:

```go
type BpfCgroupStorageKey struct {
	CgroupInodeId uint64
	AttachType    ebpf.AttachType
	_             uint32
}
```

The go program only needs a definition of the member type. Since the program
uses a per-CPU data structure, this needs to be a slice:

```go
type PerCPUCounters []uint64
```

And since we are interested in the total number of transmitted bytes regardless
of the CPU cores, here is a tiny helper:

```go
func sumPerCpuCounters(perCpuCounters PerCPUCounters) uint64 {
	sum := uint64(0)
	for _, counter := range perCpuCounters {
		sum += counter
	}
	return sum
}
```

One last thing: to access a map entry, the map structure definition is not
enough. There needs to be some actual values in it. The ``AttachType`` was
already discussed, this is the type of program (ingress, vs egress). The tricky
part is the ``CgroupInodeId``. This field is the Inode number of the cgroup
path.

Since this example is voluntarilly simplistic, it only considers a single
pre-defined hard-coded ``TARGET_CGROUP_V2_PATH`` cgroup. The Inode ID can
thus be pre-loaded once for all:

```go
	// Get cgroup folder inode number to use as a key in the per-cgroup map
	cgroupFileinfo, err := os.Stat(TARGET_CGROUP_V2_PATH)
	if err != nil {
		log.Fatal(err)
	}
	cgroupStat, ok := cgroupFileinfo.Sys().(*syscall.Stat_t)
	if !ok {
		log.Fatal("Not a syscall.Stat_t")
	}
	cgroupInodeId := cgroupStat.Ino
```

With this in place, all the supporting structures are defined and loaded on
both the eBPF and Go side. Let's start to actually store something useful in
these structures.

### Counting Cgroup ingress / egress bytes

There are 4 cases to consider:
* The transmitted packet may be on the *ingress* or the *egress* path.
* The transmitted packet may be IPv4 or IPv6.

All these cases can be simply handled in a common function on the eBPF side:

```c
inline int handle_skb(struct __sk_buff *skb)
{
    __u16 bytes = 0;

    // Extract packet size from IPv4 / IPv6 header
    switch (skb->family)
    {
    case AF_INET:
        {
            struct iphdr iph;
            bpf_skb_load_bytes(skb, 0, &iph, sizeof(struct iphdr));
            bytes = ntohs(iph.tot_len);
            break;
        }
    case AF_INET6:
        {
            struct ip6_hdr ip6h;
            bpf_skb_load_bytes(skb, 0, &ip6h, sizeof(struct ip6_hdr));
            bytes = ntohs(ip6h.ip6_plen);
            break;
        }
    default:
        // This should never be the case as this eBPF hook is called in
        // netfilter context and thus not for AF_PACKET, AF_UNIX nor AF_NETLINK
        // for instance.
        return true;
    }

    // Update counters in the per-cgroup map
    __u64 *bytes_counter = bpf_get_local_storage(&cgroup_counters_map, 0);
    __sync_fetch_and_add(bytes_counter, bytes);

    // Let the packet pass
    return true;
}
```

This is surprisingly simple. The biggest complexity here comes from the IPv4 vs
IPv6 vs error handling. The main part of interest here are map related lines.

``bpf_get_local_storage()`` encapsulates the complexity of loading the storage
area for the current ``(AttachedCgroup, ProgramType, CPU)`` tuple.

``__sync_fetch_and_add`` is a helper for atomically incrementing a counter.
Since the eBPF program is not supposed to be interrupted and the data is
per-CPU, this may not be needed in practice. There is however work underway
upstream to support eBPF preemption.

This common function can be inlined from the ingress and egress handlers:

```c
// Ingress hook - handle incoming packets
SEC("cgroup_skb/ingress") int ingress(struct __sk_buff *skb)
{
    return handle_skb(skb);
}

// Egress hook - handle outgoing packets
SEC("cgroup_skb/egress") int egress(struct __sk_buff *skb)
{
    return handle_skb(skb);
}
```

The eBPF side is now complete. The next step is to load and attach these
programs to the Cgroup of interest and do something usfull with the collected
data.

### Attach the programs and collect data

For monitoring both ingress and egress traffic, the programs needs to be
attached twice for the target cgroup. Similarly, produced data will need
to be queried for both directions.

To keep the code "DRY", let's declare a simple helper structure:

```go
type BPFCgroupNetworkDirection struct {
	Name       string
	AttachType ebpf.AttachType
}

var BPFCgroupNetworkDirections = []BPFCgroupNetworkDirection{
	{
		Name:       "ingress",
		AttachType: ebpf.AttachCGroupInetIngress,
	},low-overhead-cgroup-network-accounting-with-ebpf
	{
		Name:       "egress",
		AttachType: ebpf.AttachCGroupInetEgress,
	},
}
```

This snippet defines, for each direction, the name of the program to load from
the ELF file as well as the attach type which is needed for attaching and
querying the Cgroup map.

The programs can now be attached to the target cgroup from the previously
loaded collection using a simple loop:

```go
	// Attach program to monitored cgroup
	for _, direction := range BPFCgroupNetworkDirections {
		link, err := link.AttachCgroup(link.CgroupOptions{
			Path:    TARGET_CGROUP_V2_PATH,
			Attach:  direction.AttachType,
			Program: collec.Programs[direction.Name],
		})
		if err != nil {
			log.Fatal(err)
		}
		defer link.Close()
	}
```

The placeholder in the periodic loop can then be replaced with map queries and
reports:

```go
			for _, direction := range BPFCgroupNetworkDirections {
				var perCPUCounters PerCPUCounters

				mapKey := BpfCgroupStorageKey{
					CgroupInodeId: cgroupInodeId,
					AttachType:    direction.AttachType,
				}

				if err := cgroup_counters_map.Lookup(mapKey, &perCPUCounters); err != nil {
					log.Printf("%s: error reading map (%v)", direction.Name, err)
				} else {
					log.Printf("%s: %d\n", direction.Name, sumPerCpuCounters(perCPUCounters))
				}
			}
```

Again, this snippet loops over the pre-defined traffic directions. It then
builds a key to query the data produced by the program type corresponding to
the target direction and Cgroup.

The query itself relies heavily on Cilium's eBPF library for data marshaling
between the kernel and Go worlds. The rest is trivial.

### Demo

Now that everything is in place, and assuming the target cgroup and file names
are left unchanged, the program can now be compiled and run.

Build:

```shell
clang -g -Wall -Werror -O2 -emit-llvm -c bpf-accounting.bpf.c -o - | llc -march=bpf -filetype=obj -o bpf-accounting.bpf.o
llvm-strip -g bpf-accounting.bpf.o
go build .
```

To setup a test environment, the easiest is to open a terminal and run:

```shell
# Create the Cgroup
sudo mkdir -p /sys/fs/cgroup/unified/yadutaf

# Register the current shell PID in the cgroup
echo $$ | sudo tee /sys/fs/cgroup/unified/yadutaf/cgroup.procs

# Start an advanced networking command
ping -n 2001:4860:4860::8888
# Or, for IPv4: ping -n 8.8.8.8
```

And finally:

```shell
sudo ./bpf-net-accounting
```

Which should print something like:

```
2021/08/22 17:20:50 Attaching eBPF monitoring programs to cgroup /sys/fs/cgroup/unified/yadutaf
2021/08/22 17:20:51 -------------------------------------------------------------
2021/08/22 17:20:51 ingress: 64
2021/08/22 17:20:51 egress: 64
2021/08/22 17:20:52 -------------------------------------------------------------
2021/08/22 17:20:52 ingress: 128
2021/08/22 17:20:52 egress: 128
2021/08/22 17:20:53 -------------------------------------------------------------
2021/08/22 17:20:53 ingress: 192
2021/08/22 17:20:53 egress: 192
2021/08/22 17:20:54 -------------------------------------------------------------
2021/08/22 17:20:54 ingress: 256
2021/08/22 17:20:54 egress: 256
^C2021/08/22 17:20:54 Exiting...
```

Tadaa !

### Conclusion

This post presented the ``BPF_MAP_TYPE_PERCPU_CGROUP_STORAGE`` eBPF virtual map
for local storage through a trivial per-cgroup throughtput monitoring
application.

The main takeaways are:
* Use this storage when storing per-cgroup measures or state in a performance
  sensitive context.
* If performance is not an issue, consider using ``BPF_MAP_TYPE_CGROUP_STORAGE``
  to avoid the added complexity of managing per-cpu data.
* All eBPF cgroups of a given type attached to a given Cgroup will share the
  *same* storage.
* Attach the eBPF program to each target cgroups: This storage is tied to a
  specific attachement.

This example could be used as a basis for a real monitoring application. Such
an application could for example monitor Cgroup creation and dynamically attach
the programs on the fly. It Clould also expose collected data in OpenMetrics
(Prometheus) for integration in a larger system.

Last but not least, I would like to thank Cilium's ebpf community for [helping
me fix a tiny but essential bug](https://github.com/cilium/ebpf/pull/341) in the
library while working on this post.
