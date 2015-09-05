---
title: Using Docker to triage Nasty-Bugs(tm)
author: Jean-Tiare Le Bigot
layout: post
date: 2014-09-27
url: /2014/09/27/using-docker-to-triage-nasty-bugs/
categories:
  - Docker
tags:
  - docker
  - triagging
  - tutorial
---
Docker is the container system for reproducible builds. This is precisely what you want when dealing with bugs, especially the nastiest one: an environment where to reproduce it in a fully deterministic way.

Not long ago, I had to troubleshoot the install process of a new cool piece of software. The weird and really uncool thing with this bug is that it only occurred on the first install install attempt. Even with a full (well, in theory) wipe, there still remained some kind of side effect on the system causing the subsequents install attempts to succeed. Anyone who has ever dealt with Q/A will know what I mean when I say this is pretty damn frustrating. (1)

Traditional approach: use a smart combination of script and snapshots.

Wait, isn't it exactly what Docker those ? Sure it is !

Even better than that: Docker saves one snapshot for each step. This is awesome
  
when iterating.

Let's build a `Dockerfile` for a Python project (Whoops, did I just name the perpetrator?):

<pre><code class="dockerfile"># start from clean, minimalist system
FROM debian:stable

# step 1: make it less minimalist
RUN apt-get update && apt-get install -y git vim python-pip

# step 2: grab code from GIT repo + switch to dev branch
RUN mkdir -p /usr/src && git clone http://some-server/my-project /usr/src/my-project --branch fix-nastybugtm

# step 3: change workdir so it spares me one 'cd' one each attempt
WORKDIR /usr/src/my-project
</code></pre>

As recommended by [Docker's best practices][1], each logical step is grouped on its own dedicated line so that we keep the number of intermediate snapshots reasonable.

Speaking of snapshots, let's build our lab environment:

<pre class="brush: bash; title: ; notranslate" title="">docker build -t my-project-lab .
</pre>

And work on it!

<pre class="brush: bash; title: ; notranslate" title="">docker run -t -i –rm my-project-lab /bin/bash
</pre>

This is where all the magic happens. We tell Docker to fire our `my-project-lab` env from a clean copy in interactive mode (`-i`) and do not attempt to retain data for later use, we won't need it (`--rm`). As we're interactive, we'll need a shell. I use `/bin/bash` but given recent security context, I may want to be a better hipster and user `/bin/zsh`.

See how easy it is to industrialize bug fighting with Docker!

Any time you've come closer to you bug, feel free to update your `Dockerfile` and rebuild the image. That's one less step to do manually.

(1) actually, it was even more fun: the bug only occurred when installing from
  
release website. Installing from GIT was always successful.

 [1]: https://docs.docker.com/articles/dockerfile_best-practices/
