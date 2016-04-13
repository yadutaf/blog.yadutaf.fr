---
title: 'Introduction to Linux namespaces – Part 6: USER'
author: Jean-Tiare Le Bigot
layout: post
date: 2016-04-20
url: /2016/04/20/introduction-to-linux-namespaces-part-6-user/
categories:
  - Security
  - Sysadmin
tags:
  - linux
  - namespace
draft: true
---

Two years ago (already...), I started a post series introducing Linux Namespaces and never took the time to write about the 6th namespace, arguably the trickier to get right. And to be completely honest, at that time, I thought I understood it. But I did not. Huh.

Now that's it is supported by Docker, and that I've even blogged about possible usage, it's time for the the 6th post. Funny thing is, in the mean time a 7th namespace has been added.

If you haven't done so already, I encourage you to read [the first post of this series for an introduction to linux namespace isolation mechanism](https://blog.yadutaf.fr/2013/12/22/introduction-to-linux-namespaces-part-1-uts/).

### What is a (user) namespace?

OK, you probably did not read it, despite my invitation above, so I'll try to get back to te basis.

Just like any namespace in every field, Linux namespaces allow a given value to have a different meaning in specific contexts.

If that sounds abstract to you, that's because it is. Let's put it another way. Take the ``root`` user, uid ``0`` on your system. Take the ``root`` user, still uid ``0``, but in a new user namespace. This "root" user in the namespace can be, say, user ``john``, uid ``1000`` on the host.

Let me rephrase that another time. You can have your ``john`` user from the host appear and behave as user ``root`` in a user namespace or container. Yes Root.

In a nutshell, user namespaces can be used to
- By root user to create containers with a "faked" root
- By random users to create containers and gain "virtual" root in it

Both have "interesting" security implications.

For now, I'll assume the first case and come back to the second case later.

### User Namespaces for root

I won't dive too much in the details here, but for security reasons, most real root features are disabled from the kernel for this faked root. You can't change network roots, most filesystems can't be mounted, don't even try to load a kernel module. If you were looking for an easy privilege escalation technique, wrong post :)

It does not mean the security is perfect. The kernel is still shared, this is still young code, but as of v4.3-rc1 all security concerns are [considered addressed](https://lwn.net/Articles/657432/).

OK, On a more crusty, crunchy aspect, some technicall details.

User namespaces are created by passing the ``CLONE_NEWUSER`` flag to ``clone()`` or ``unshare()`` syscall since Linux 3.5 by root, or any user starting with Linux 3.8 (but don't, use a recent kernel, I beg you).

Once created, the mapping can be created. This is controlled via 2 special ``/proc/[PID]/`` entries:

- ``uid_map`` controls the user IDs mapping
- ``gid_map`` controls the group IDs mapping

Each of these pseudo-file may have up to 5 rules. This is an arbitrary limit that may change in the future.

The rules are of the form:

```
<UID in the container> <UID in the parent container> <Range length>
```

Which reads as "Map <Range length> <UID in the container> to <UID in the parent container>".

For example, to map 65536 users in a container to users 100000 to 165536 in the host as is commonly done on default setups, one would the following rule in both ``uid_map`` and ``gid_map`` files:

```
0 100000 65536
```

For the record, the default value, without containers is:

```
0 0 4294967295
```

Which reads as: "map all possible 32 bits uids, 1 to 1". OK. That's consistent.

OK, cool, so, with this, I can remap arbitrary users in the container to arbitrary users on the host. What if I "forget" an ID?

In this case, if an ID is forgotten and the kernel can't translate it, it will default to ``nobody`` for users and ``nogroup`` for groups. User will be granted the "other" permissions, even if they explicitely setuid to nobody (uid 65536). If you hoped to use it to escape some restrictions, you're out of luck. Again.

Starting with Linux 3.19 (and possibly older, due to security backports), one additional pseudo-file under /proc/pid can be used to further control user namespaces, ``setgroups``. It accepts one of ``deny`` or ``allow``. Setting it to ``deny`` will disable the [``setgroups``](http://man7.org/linux/man-pages/man2/setgroups.2.html) syscall, fixing a potential security hole when sharing files having more permissions on "other" that "group" bits between namespaces. See the [user namespace man page](http://man7.org/linux/man-pages/man7/user_namespaces.7.html) for more backgroud.

TODO: code samples

### User Namespaces for users

TODO: introduce subuids
