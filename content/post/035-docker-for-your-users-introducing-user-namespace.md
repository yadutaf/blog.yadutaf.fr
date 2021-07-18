---
title: "Docker for your users - Introducing user namespace"
author: Jean-Tiare Le Bigot
layout: post
date: 2016-04-14
url: /2016/04/14/docker-for-your-users-introducing-user-namespace/
categories:
  - Sysadmin
tags:
  - linux
  - userns
  - docker
  - security
---

A few years ago, back when I was a student, my school had rooms full of counters running Linux that any student could use at any time. We all had a personal account on the machines and the machine management was done by a dedicated team.

Every once in a while, we found ourselves needing a specific tool like `valgrind` which was not readily available or a more recent version of another tool. Like `gcc`. Replace "valgring" and "gcc" with "Node", "Rust" or "Go". You get the idea.

At that point, we basically had 2 options. Either the tool was vital to our study, and it was possible to get it installed for everybody. Or it was not, we were just experimenting on our own as part of a random project.

In the later case, the only solution was to build it from scratch, put it in our `$HOME`, mess up with^W^W^W tweak the `$PATH` and `$LD_LIBRARY_PATH` environment variables and sometime get some voodoo involved.

It _usually_ worked.

A year ago, I was giving a talk to introduce Docker and, in the question section, I was asked whether I believed Docker could be a solution to this kind of problem. I answered that it was a dangerous idea. Giving docker access to user was basically like giving him the `root` password. He would be better with traditional VMs

Recently, the question came back to me.

As it turns out, the response has changed and this is a good occasion to talk about the 6th namespace. The one I never blogged about in my [introduction to Linux Namespaces](https://blog.yadutaf.fr/2013/12/22/introduction-to-linux-namespaces-part-1-uts/)... But I will soon #teaser.

### User Namespaces and Docker

(If you don't like or care about the technical background, you can safely skip this part)

In a nutshell, a user namespace is a special Linux kernel mechanism allowing Docker container's to have a "faked" root user. For example, the root user in a container would be able to manage it's root owned files in the container, act as any user in the container, manage his own network interfaces and some of his mountpoints (restrictions apply) and at the same time being "mapped" or "translated" to, say, user "ubuntu" with uid 1000 on the host system.

User namespaces are have been introduced as early as Linux 3.5 and are considered as stable [starting with Linux 4.3](https://lwn.net/Articles/657432/).

I won't dive too much in the details of user namespaces here, I'd really love too, low level bits are by far my favorite topic, but that would be far out of the scope of this post. But stay tuned. While writing this post, I started a more technical one on this very subject ;)

As far as docker is concerned, starting with Docker 1.10 (the current stable version at the time of writing), it supports a new `daemon` option `--userns-remap=[USERNAME]`.

Neat.

Wait, what does this `--userns-remap` and `[USERNAME]` stuff stand for exactly?

As suggested just earlier, user namespace works by mapping some virtual user ids like root to other user ids on the host. Hence the option name `--userns-remap`.

Regarding, "[USERNAME]", refers to [`/etc/subuid` and `/etc/subgid`](http://man7.org/linux/man-pages/man5/subuid.5.html) files. In a word, these files define the user and group ids a given user can use, beyond his own user id. Just like root can impersonate any user id. If you wonder where this file come from, it's from [stock `useradd` command](https://github.com/shadow-maint/shadow/blob/ef45bb2496182b5df90ad0323bef75d1a5d69887/src/useradd.c#L2188). Every time a real user (not a system user) is created on the system, a range of 65536 sub-ids is allocated.

Does is sound new? Well, not that much. It was [introduced in early August... 2013](https://github.com/shadow-maint/shadow/commit/f28ad4b251a42a35c29685850d1686a083cac725).

Anyway, it maintains simple flat text files looking like:

    yadutaf:100000:65536
    somuser:165536:65536
    ...

It reads as: "Let user 'yadutaf' use 65536 uids, starting at 100000" and "Let user 'someuser' use 65536 uids, starting at 165536". Which is basically the next adjacent range.

The rule is not set in stone, but the start sub-uid can be guessed as

    FIRST_SUB_UID = 100000 + (UID - 1000) * 65536

Again, this is only a convention. We can do something slightly different like:

    yadutaf:1000:1
    yadutaf:100000:65535

It reads as "let user yadutaf use his own uid as well as 65535 uids, starting at 100000 and making the total of uids to 65536".

And this won't break anything.

Well, actually, this is where is starts to get interesting.

When starting docker with `docker daemon --userns-remap=yadutaf`, docker will parse the subuid and subgid files for `yadutaf`, sort all read entries by growing start id and generate kernel userns mapping rules. Without diving too much into the details, this will generate the following rules in `/proc/[PID]/uid_map`:

             0       1000          1
             1     100000      65535

Which should look familiar. This structures looks like the one above, but the meaning it slightly different. This time, it reads as:

> *   "Let uid 1000 _outside_ the container act as `root` _inside_ the container"
> *   "Let the 65535 uids starting with 100000 _outside_ the container act the 65535 uids starting with 1 _inside_"

In other words, 1000 will be 1 and 100002 will be 3.

This is extremely powerful as this is key to share files between your main host system and your container without loosing access to them. You need a common uid. This common uid will be root in the container while being yours in the real system context.

### Give power back to the user, no (security) compromise

With all this in mind, we can put the pieces together and let the magic happen. We need to:

*   get latest Docker release (>=1.10.0)
*   configure the subids so that our user will act as root in the container
*   configure docker so that it used our ranges
*   use real-world applications

Of course, as the name is passed on the command line of the docker daemon, this will only work for a single user. But keep in mind that Docker 1.10 is the first version to support this feature. It may evolve in the future and get more flexible

OK, let's start. Assuming our user is "yadutaf" (that's me) with uid 1000, we'll want `/etc/subuid` and `/etc/subgid` to contain:

    yadutaf:1000:1
    yadutaf:100000:65535

And we want docker daemon to use it, without messing with systemd's unit files (trust me, you don't want to), so we'll use the docker configuration file `/etc/docker/daemon.json`:

    {
            "userns-remap": "yadutaf"
    }

All we have to do is restart the daemon, run an innocent, random, test container and see the result:

    $ sudo systemctl restart docker
    $ docker run -d --name redis-userns redis
    $ cat /proc/$(docker inspect -f '{{ .State.Pid }}' redis-userns)/uid_map
             0       1000          1
             1     100000      65535

Hooray!

What about graphical? What about sound? You promised read applications didn't you? Sure I did. Here is a working Firefox:

First, the Dockerfile:

    FROM ubuntu
    MAINTAINER Jean-Tiare Le Bigot <jt AT yadutaf DOT fr>

    # Get PulseAudio for the sound, Firefox for, well, you know...
    RUN apt-get update && apt-get -y install firefox pulseaudio

    ENTRYPOINT ["firefox"]

Build and run it:

    $ docker build -t firefox .
    $ docker run --rm -it \
        -v /tmp/.X11-unix:/tmp/.X11-unix \
        -v /run/user/$UID/pulse/native:/run/pulse \
        -e DISPLAY=unix$DISPLAY \
        -e PULSE_SERVER=unix:/run/pulse \
        --name firefox \
        firefox --new-instance "https://www.youtube.com/watch?v=k1-TrAvp_xs"

What it does is:

*   share the X11 socket
*   share the user's pulseaudio socket as root's
*   expose them via environment variables
*   start it!

As a (desirable) side-effect, setting docker daemon with user namespaces effectively disables a variety of security sensitive options like starting privileged containers or sharing the host's network. This extra-security comes with the kernel's implementation and we'll certainly not refuse it!

Of course, this has limitations. For example, if you try with chrome, you'll be disappointed to realize there is no sound. This is because chrome requires the older Alsa sound system which are only accessible to the "audio" group. But this group is not and can't be mapped in Docker just yet. This is supported by the kernel though. Just not Docker. By the way, if you want to test out chrome, make sure to add the `--disable-setuid-sandbox` flag

This limitation aside, this is fairly interesting. Using similar setups, you can have docker on your host, exploit most of it power, without ever taking the risk to compromise your security or integrity.
