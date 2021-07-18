---
title: Testing X2go on OVH Public Cloud
author: Jean-Tiare Le Bigot
layout: post
date: 2012-01-17
url: /2012/01/17/testing-x2go-on-ovh-public-cloud/
categories:
  - Sysadmin
tags:
  - automation
  - Cloud
  - OVH
  - Public Cloud
  - remote desktop
  - ssh
  - test
  - tutorial
  - X2go
---
About 1 month ago, [OVH][1] launched its &#8220;Public Cloud&#8221;. This basically is a solution taking inspiration from Amazon's AWS without being subject to the Patriot Act. At the moment, the &#8220;Public Cloud&#8221; is still pretty young and lacks some vital functionality as custom templates or a real storage solution but it's on the way.

[X2go][2] is an open source remote desktop solution based on the very per-formant NX protocol. It feels very much like the remote server is in the same room. After a very quick test, it seems to much lighter and responsive than RDP.

<!--more-->

# Remote instance setup

Subscriptions to the gamma test OVH's Cloud are here: [http://www.ovh.com/fr/cloud/][3]. They provide us with a nice and easy to use web interface as well as a full SOAP API and a shell script to automate instance and project management.

<div id="attachment_104" style="width: 310px" class="wp-caption aligncenter">
  <a href="http://blog.jtlebi.fr/wp-content/uploads/2012/01/ovh-manager.png"><img class="size-medium wp-image-104" title="OVH's instance manager" src="http://blog.jtlebi.fr/wp-content/uploads/2012/01/ovh-manager-300x144.png" alt="OVH's instance manager" width="300" height="144" /></a>
  
  <p class="wp-caption-text">
    OVH's instance manager
  </p>
</div>

As the web interface is pretty intuitive, I'll focus on the shell script usage in this blog post.

The first command in the script will ask you for your credentials to launch a session. They are the same as the one used to connect to the &#8220;Manager&#8221;.

<pre class="brush: bash; title: ; notranslate" title="">$ wget http://www.ovh.com/fr/cloud/api/ovhcloud #download the script
$ chmod +x ovhcloud
$ ./ovhcloud instance addProject --name x2go-ovh # create a new project
$ ./ovhcloud instance getProjects #Lists all your projects
</pre>

Note: each object (Project, Instance, Task, Offer, Zone, &#8230;) are suffixed to actions (get, add, delete, make, &#8230;).

Next step is to create the instances you need. In this example, I'll create a single one.

<pre class="brush: bash; title: ; notranslate" title="">$ ./ovhcloud instance newInstance --projectName x2go-ovh --offerName xs --distributionName ubuntu1004-x64 --zoneName rbx1 --name server</pre>

TIP: For each parameter &#8220;*name&#8221; of this command, you can get a list of this possible values by issuing this command :

<pre class="brush: bash; title: ; notranslate" title="">$ ./ovhcloud instance get* #General command
$ ./ovhcloud instance getDistributions #example
Function returned:
base    name               platform description
----    ----               -------- -----------
ubuntu  ubuntu1004-x64     64       OVH Ubuntu 1004 distribution - 64 bits
windows win2008sp2-std-x64 64       windows 2008sp2 std distribution - 64 bits
centos  centos5-x64        64       OVH Centos 5 distribution - 64 bits
debian  debian564          64       OVH Debian 5 distribution - 64 bits
debian  debian664          64       OVH Debian 6 distribution - 64 bits
</pre>

Each command leads to the internal creation of a &#8220;task&#8221; in the remote system. Let's get a list of the tasks related to our project :

<pre class="brush: bash; title: ; notranslate" title="">$ ./ovhcloud instance getTasks --projectId ****
projectId (long): ***
Function returned:
instanceId function    status finishDate zone comment lastUpdate                currentDetailedState todoDate                  id
---------- --------    ------ ---------- ---- ------- ----------                -------------------- --------                  --
66301      addInstance doing             rbx1         2012-01-16T13:52:08+01:00 installOns           2012-01-16T13:51:52+01:00 14571</pre>

Sadly the call interface is not consistent between functions. For some, one needs to give a project's name whereas on other, it is the ID&#8230;

You can now use ssh to connect the instance.The following command will launch an interactive menu as the required parameter &#8220;instanceId&#8221; has not been specified. Anyway, it is not possible to specify it since this command is buggy <img src="https://blog.jtlebi.fr/wp-includes/images/smilies/frownie.png" alt=":(" class="wp-smiley" style="height: 1em; max-height: 1em;" />

<pre class="brush: bash; title: ; notranslate" title="">$ ./ovhcloud instance ssh</pre>

Note: you can also directly grab the credentials and IP and use them to manually ssh. This could be used when tunneling for example.

<pre class="brush: bash; title: ; notranslate" title="">$ ./ovhcloud instance getLoginInformations</pre>

# Installing X2go on the instance

This part is (almost) independent from the previous one. I'll assume you are connected to a remote server running Ubuntu 10.04. It should be fine with any supported flavor of Ubuntu but I did not test it.

On the remote server as well as the local client, install the package repository

<pre class="brush: bash; title: ; notranslate" title="">$ sudo apt-get install python-software-properties #installation de la commande "add-apt-repository"
$ sudo add-apt-repository ppa:x2go/stable
$ sudo apt-get update</pre>

The installation is as easy as this

<pre class="brush: bash; title: ; notranslate" title="">$ sudo apt-get install x2goserver
$ sudo apt-get install ubuntu-desktop
$ sudo apt-get install x2gognomebindings #brings some integration </pre>

No additional configuration is required ! Nonetheless, you should create a low privileged user as a client&#8230;

On the client side, just install package &#8220;x2goclient&#8221;.

<pre class="brush: bash; title: ; notranslate" title="">$ sudo apt-get install x2goclient </pre>

# Conclusion

You should now be able to run a Cloud desktop. It is possible to start/stop it on demand with a simple shell command :

<pre class="brush: bash; title: ; notranslate" title="">$  ./ovhcloud instance stopInstance --instanceID *** </pre>

This &#8220;Public Cloud&#8221; is still very young. The script lacks consistency and is buggy, no real storage option is yet offered, &#8230; Nonetheless, it looks very promising and the dev team listens well to users feedback <img src="https://blog.jtlebi.fr/wp-includes/images/smilies/simple-smile.png" alt=":)" class="wp-smiley" style="height: 1em; max-height: 1em;" />

I encourage the reader to test sound, folder and printer sharing between the client and the remote desktop. My experience is that the sound only works from a theoretical point of view as it uses a huge BP. Folder sharing is OK and I could not manage to make printer sharing work (at the moment).

Enjoy !

 [1]: http://www.ovh.com/ "OVH website"
 [2]: http://www.x2go.org/ "X2go official Website"
 [3]: http://www.ovh.com/fr/cloud/ "OVH public Cloud Subscription"