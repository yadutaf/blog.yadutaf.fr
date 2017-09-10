---
title: "Running a graphical app in a Docker container, on a remote server"
author: Jean-Tiare Le Bigot
layout: post
date: 2017-09-10
url: /2017/09/10/running-a-graphical-app-in-a-docker-container-on-a-remote-server/
categories:
  - Sysadmin
tags:
  - linux
  - netns
  - docker
  - ssh
---

A few days ago, I found myself trying to launch Qemu, the system emulator, into a dedicated [network namespace]({{< relref "2014-01-19-introduction-to-linux-namespaces-part-5-net.md" >}}) (that's easy), on a remote host (that's the fun part). As it was fun, I looked for a way to do it. Spoiler alert, it involves "xauth" tricks, bind mounts and TCP to UNIX domain socket forwarding. No more.

My first though was that it's probably not worth a blog post. Who uses network namespaces on a daily basis? Not everyone (I do).

Except that network namespaces are one of the containers corner stone. And quite a lot of people is using Docker on a daily basis, possibly on a remote server, possibly with graphical applications.

Hmmm, that's another story. Let's write a new container torture post then.

At the end of this post, you will have a working setup to run graphical applications in a Docker container on a remote server accessed via SSH with X11 forwarding with not particular setup on the container side.

### Running a graphical app via SSH

Running a graphical application on a remote (Linux) server via SSH is considered a solved problem (at least until we run Wayland on servers...). Here is a quick walk through anyway.

By default, if you try to run an X11 based graphical application via SSH, it will not display anything and instead print a rather cryptic error message:

```
ssh localhost -- xterm
xterm: Xt error: Can't open display: 
xterm: DISPLAY is not set
```

This is easily fixed by explicitly enabling X11 forwarding, if the server policy allows it, by adding the "-X" argument:

```bash
ssh -X localhost -- xterm
```

You should now see a beautiful xterm window. Granted, it's not the most impressive. Who cares?

### Running a graphical app inside a Docker

Running a graphical application in a Docker container, is also considered a solved problem, mostly thanks to [Jessie Frazelle's posts on the topic](https://blog.jessfraz.com/post/docker-containers-on-the-desktop/) and numerous other SO questions and posts. Let's do one more :)

For the sake of this post, I'll use this simple Dockerfile:

```
FROM ubuntu

RUN apt-get update && apt-get install -y xterm
RUN useradd -ms /bin/bash xterm
USER xterm
WORKDIR /home/xterm
```

All it does is start from a Ubuntu image, install the xterm package, creates a dedicated user and set the env to use this user. This is in no way the perfect Dockerfile, but it serves its goal!

If you try to run it the "naive" way, here is what it should look like:

```bash
$> docker run -it --rm xterm xterm 
xterm: Xt error: Can't open display: 
xterm: DISPLAY is not set
```

OK, let's bring in the DISPLAY variable... and bring the related X11 Unix socket:

```bash
docker run -it --rm -e DISPLAY=${DISPLAY} -v /tmp/.X11-unix:/tmp/.X11-unix xterm xterm
```

Great, an Xterm window. Told you this is one was easy.

### Next level: Running a graphical application in a Docker via SSH

Now that we know how to run a graphical app from a Docker container *OR* from a remote server via SSH, let's see how we can do *both* at a time. Let's run a graphical application inside a Docker container, on a remote server.

First, let's try to naively chain both tricks: (spoiler: it won't work)

```bash
ssh -X localhost
docker run -it --rm -e DISPLAY=${DISPLAY} -v /tmp/.X11-unix:/tmp/.X11-unix xterm xterm
```

You should get an error like:

```
xterm: Xt error: Can't open display: localhost:10.0
```

OK, so the brute force approach does not work. What's going on exactly?

Have a look at the ``DISPLAY`` environment variable, when running a graphical app:

- In a Docker container: ``:0``
- On a remote server via SSH: ``localhost:10.0``

Your mileage may vary, but the first obvious things is they do not describe the same thing.

The first one, the Docker version, instructs the X11 client to look for the ``/tmp/.X11-unix/X0`` UNIX domain socket to talk to the local X server. Obviously, using a UNIX domain socket has not chance to work on a remote system. Hence the different value. It instructs the X11 client to talk to the "remote" X server on localhost, "slot" 10 over TCP.

I said "slot" as this is not an actual port number. The actual port number is ``6000 + slot``.

We can now see that the process listening on port 6010 on the server is the SSH daemon itself:

```bash
sudo lsof -i4:6010
COMMAND   PID       USER   FD   TYPE   DEVICE SIZE/OFF NODE NAME
sshd    30333 jean-tiare   10u  IPv4 23770030      0t0  TCP localhost:6010 (LISTEN)
```

In this case the SSH daemon opens a TCP tunnel between the client and the remote server and forwards all data to the local server as specified by the local ``DISPLAY`` environment variable.

One way to overcome this limitation is to launch the Docker container using the host's network namespace with ``--net host`` but this is generally not what you want as you'd break your network isolation in the same time.

Another way to overcome this, is to re-export the TCP connection as a UNIX domain socket and launch the application like we are used to. Fortunately, a well-known tool can do exactly this: socat.

```bash
# Log into the remote server
ssh -X localhost

# Get the Display number from the DISPLAY variable
DISPLAY_NUMBER=$(echo $DISPLAY | cut -d. -f1 | cut -d: -f2)

# Proxy between the TCP and the Unix domain world, in the background
socat TCP4:localhost:60${DISPLAY_NUMBER} UNIX-LISTEN:/tmp/.X11-unix/X${DISPLAY_NUMBER} &

# Expose the "new" display address
export DISPLAY=:$(echo $DISPLAY | cut -d. -f1 | cut -d: -f2)

# Finally, open xterm in the Docker....
docker run -it --rm -e 'DISPLAY=${DISPLAY}' -v /tmp/.X11-unix:/tmp/.X11-unix xterm xterm
```

Which should output something like:

```
X11 connection rejected because of wrong authentication.
xterm: Xt error: Can't open display: :10
```

"Wrong authentication"? What do you mean by "wrong authentication"?

X11 uses a concept of "magic cookies" to grant access to the server. A bit like web cookies. If you don't have the cookie, you can not open a connection to the server and then not display anything. This authentication information is stored in ``~/.Xauthority`` and can be manipulated using the ``xauth`` command.

Still from the SSH connection, Let's retry the proxy trick with the authority file mounted in the container:

```bash
socat TCP4:localhost:60${DISPLAY_NUMBER} UNIX-LISTEN:/tmp/.X11-unix/X${DISPLAY_NUMBER} &
docker run -it --rm \
  -e DISPLAY=${DISPLAY} \
  -v /tmp/.X11-unix:/tmp/.X11-unix \
  -v ${HOME}/.Xauthority:/home/xterm/.Xauthority \
  xterm xterm  
```

And...

```
X11 connection rejected because of wrong authentication.
xterm: Xt error: Can't open display: :10
```

Still not...

Let's have a look at what ``xauth list`` outputs:

```
...
jt-laptop/unix:10  MIT-MAGIC-COOKIE-1  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
...
```

The cookie is obviously bogus in the example. But the interesting part is: the hostname is actually part of the authentication. Each Docker container get its own hostname. Maybe that's the cause of the last failure?

We can cheat and force the hostname inside the container to be the same as the SSH host and retry:

```bash
socat TCP4:localhost:60${DISPLAY_NUMBER} UNIX-LISTEN:/tmp/.X11-unix/X${DISPLAY_NUMBER} &
docker run -it --rm \
  -e DISPLAY=${DISPLAY} \
  -v /tmp/.X11-unix:/tmp/.X11-unix \
  -v $HOME/.Xauthority:/home/xterm/.Xauthority \
  --hostname $(hostname) \
  xterm xterm
```

It works! (tm)

To sum it up:

```bash
# Open an SSH connection to the remote server
ssh -X localhost

# Get the DISPLAY slot and create the new DISPLAY variable
DISPLAY_NUMBER=$(echo $DISPLAY | cut -d. -f1 | cut -d: -f2)
export DISPLAY=:${DISPLAY_NUMBER}

# Proxy between the TCP and the Unix domain world, in the background
socat TCP4:localhost:60${DISPLAY_NUMBER} UNIX-LISTEN:/tmp/.X11-unix/X${DISPLAY_NUMBER} &

# Finally, open xterm in the Docker....
docker run -it --rm \
  -e 'DISPLAY=${DISPLAY}' \
  -v /tmp/.X11-unix:/tmp/.X11-unix \
  --hostname $(hostname) \
  xterm xterm
```

### Stretch goal: clean it up! 

The proof of concept works, that's great. How can we make it cleaner? Well, first remember that containers goal is to to isolate as much as possible an application from the host. Sharing the X11 server is not exactly the best way to do it... but we we can't really help on that. What we can (should) isolate:

* The hostname. We overloaded it such that it matches the one of the SSH server.
* The Unix sockets. They are all shared in all containers sharing the same trick.

We can set the DISPLAY variable to whatever we want, provided

1. We have the corresponding UNIX domain socket
2. We have the corresponding authentication cookie

The later is also true for the hostname.

On the remote server, let's do some setup:

```bash
# Prepare target env
CONTAINER_DISPLAY="0"
CONTAINER_HOSTNAME="xterm"

# Create a directory for the socket
mkdir -p display/socket
touch display/Xauthority

# Get the DISPLAY slot
DISPLAY_NUMBER=$(echo $DISPLAY | cut -d. -f1 | cut -d: -f2)

# Extract current authentication cookie
AUTH_COOKIE=$(xauth list | grep "^$(hostname)/unix:${DISPLAY_NUMBER} " | awk '{print $3}')

# Create the new X Authority file
xauth -f display/Xauthority add ${CONTAINER_HOSTNAME}/unix:${CONTAINER_DISPLAY} MIT-MAGIC-COOKIE-1 ${AUTH_COOKIE}

# Proxy with the :0 DISPLAY
socat TCP4:localhost:60${DISPLAY_NUMBER} UNIX-LISTEN:display/socket/X${CONTAINER_DISPLAY} &

# Launch the container
docker run -it --rm \
  -e DISPLAY=:${CONTAINER_DISPLAY} \
  -v ${PWD}/display/socket:/tmp/.X11-unix \
  -v ${PWD}/display/Xauthority:/home/xterm/.Xauthority \
  --hostname ${CONTAINER_HOSTNAME} \
  xterm xterm
```

And voila! (french accent inside) You no have the most beautifully awesome graphical app running on a remote (as far as localhost is remote) server, inside a Docker container.
