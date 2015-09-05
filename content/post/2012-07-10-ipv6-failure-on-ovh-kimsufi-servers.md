---
title: IPv6 fails after a certain time
author: Jean-Tiare Le Bigot
layout: post
date: 2012-07-10
url: /2012/07/10/ipv6-failure-on-ovh-kimsufi-servers/
categories:
  - Sysadmin
tags:
  - IPv6
  - kimsufi
  - OVH
---
[UPDATE]

I still did not find the real source of the problem but it seems that both OVH and Ubuntu stock kernel fail to renew the default routes. Good news, it can be manually renewed, including from a Cron job:

`rdisc eth0`

[ORIGINAL POST]

This blog as well as a couple other private tools are hosted on a kimsufi 2G OVH server. They've offered IPv6 on their dedicated boxes for quite a while yet and I'm proud to be hosted by such leaders.

Sadly, they are also famous for screwing it up on lower end servers and I just lost my evening trying to fix the configuration. Curiously my gateway had gone away. This should not have been an issue because of the RA protocol of IPv6.This is strange

Anyway, the only fix that worked for me was simply to

<pre>sudo /etc/init.d/networking restart</pre>

I hope it can help some of you <img src="https://blog.jtlebi.fr/wp-includes/images/smilies/simple-smile.png" alt=":)" class="wp-smiley" style="height: 1em; max-height: 1em;" />