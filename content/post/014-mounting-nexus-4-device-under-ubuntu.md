---
title: Mounting Nexus 4 device under Ubuntu
author: Jean-Tiare Le Bigot
layout: post
date: 2013-03-04
url: /2013/03/04/mounting-nexus-4-device-under-ubuntu/
categories:
  - Non classé
---
I've not posted here in a while as I'm now full time busy with my startup project. More on this later <img src="https://blog.jtlebi.fr/wp-includes/images/smilies/simple-smile.png" alt=":)" class="wp-smiley" style="height: 1em; max-height: 1em;" />

I'm also now the lucky owner of a brand new Google Nexus 4 phone. Sadly, it does not work out of the box with Ubuntu yet and most forums recommends some kind of manual hacking/mounting. Luckily, there is a much easiest solution.

Ubuntu 13.04 will see an updated MTP GVFS stack which Philip Langdale back-ported in a PPA. To get it on your Ubuntu box, just enter this in a terminal:

<pre class="brush: bash; title: ; notranslate" title="">sudo add-apt-repository ppa:langdalepl/gvfs-mtp
sudo apt-get update
sudo apt-get upgrade
</pre>

Enjoy!