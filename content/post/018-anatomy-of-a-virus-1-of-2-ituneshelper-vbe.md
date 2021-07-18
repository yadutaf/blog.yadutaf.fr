---
title: 'Anatomy of a virus: iTunesHelper.vbe 1/2'
author: Jean-Tiare Le Bigot
layout: post
date: 2013-11-18
url: /2013/11/19/anatomy-of-a-virus-1-of-2-ituneshelper-vbe/
categories:
  - Security
tags:
  - iTunesHelper
  - security
  - virus
---
**Disclaimer**: This post is about a real virus, really seen in the wild. It was written on the sole goal of helping the reader to better protect itself. This post is _NOT_ about writing viruses. I will _NOT_ provide any source code nor any directions to build a virus. If this is what you were looking for: Please, I beg you to change your mind and start building something useful to the community instead of attacking it. Thanks for reading.

I recently identified a virus called &#8220;iTunesHelper.vbe&#8221; on my Dad's personal laptop. By the time we noticed it it already had infected the whole House. Let aside the (pretty bad) surprise I found interesting that none of the (up to date) Antivirus were able to detect it. And, interestingly enough this virus is script based, hence easily studied. Let's dive in it.

This first post is a purely qualitative approach, voluntarily avoiding any source reading. For a more in-depth approach, you may be interested in reading the [second part of this post][1]. 

**1/ Lab system**

  * Windows XP, in a virtual Machine
  * NO updates
  * NO antivirus software
  * >1GB RAM

Infection test was run from this VM. Analysis was performed directly on my Linux laptop with no special security as it lacks the required runtime.

**2/ Symptoms**

When an infected USB mass storage is connected to a target system, all files on its root folder appears as shortcuts instead of plain files. This set aside, icons are as expected and &#8220;files&#8221; behaves apparently behave as expected too.

<!--more-->

<div id="attachment_344" style="width: 310px" class="wp-caption aligncenter">
  <a href="https://blog.jtlebi.fr/wp-content/uploads/2013/11/iTuneHelper-1-visible.png"><img class="size-medium wp-image-344" alt="iTuneHelper, only shortcuts visible" src="https://blog.jtlebi.fr/wp-content/uploads/2013/11/iTuneHelper-1-visible-300x225.png" width="300" height="225" /></a>
  
  <p class="wp-caption-text">
    iTuneHelper, only shortcut visible
  </p>
</div>

Diving a little deeper the shortcut appears to _really_ be a shortcut:

<div id="attachment_346" style="width: 310px" class="wp-caption aligncenter">
  <a href="https://blog.jtlebi.fr/wp-content/uploads/2013/11/iTuneHelper-3-really.png"><img class="size-medium wp-image-346" alt="iTunesHelper. The shortcut is the virus vector" src="https://blog.jtlebi.fr/wp-content/uploads/2013/11/iTuneHelper-3-really-300x298.png" width="300" height="298" /></a>
  
  <p class="wp-caption-text">
    iTunesHelper. The shortcut is the virus vector
  </p>
</div>

Here is the full, plain text target:

<pre class="brush: plain; title: pseudo shortcut target; notranslate" title="pseudo shortcut target">C:\WINDOWS\system32\cmd.exe /c start iTunesHelper.vbe&start Secret" "Text" "File.txt&exit
</pre>

Which basically means:

  1. run &#8220;iTunesHelper.vbe&#8221;
  2. open the real &#8220;Secret Text File.txt&#8221;
  3. and you're done

Huh huh, interesting. But where are theses files located ? Turning off &#8220;Hide protected operating system files&#8221; in &#8220;Folder Options&#8221; will do the trick. Yes ! This nice piece of software pretends to be an essential piece of the Operating System. Simple and efficient way to _dissimulate_ itself from almost all computers. Here is what one could then see:

<div id="attachment_345" style="width: 310px" class="wp-caption aligncenter">
  <a href="https://blog.jtlebi.fr/wp-content/uploads/2013/11/iTuneHelper-2-all.png"><img class="size-medium wp-image-345" alt="iTuneHelper, payload and real files when system files are visible" src="https://blog.jtlebi.fr/wp-content/uploads/2013/11/iTuneHelper-2-all-300x225.png" width="300" height="225" /></a>
  
  <p class="wp-caption-text">
    iTuneHelper, payload and real files when system files are visible
  </p>
</div>

Last but not least, the name &#8220;iTunesHelper.vbe&#8221; itself has been chosen for dissimulation. &#8220;iTunesHelper.**exe**&#8221; being an actual.. &#8220;iTunes background Helper&#8221;.

Long story short: The virus dissimulate itself under the name of a common software and pretending to be an essential system file. Nonetheless, it is still quite easy to suspect it's presence as it replaces all files on the root of the drive by shortcuts.

**2/ Propagation Mechanism**

With all this initial analysis done it is now straightforward to guess the virus' propagation mechanism:

  1. System is clean
  2. Infected drive is inserted. Nothing happens
  3. A file is opened from the drive
  4. The virus payload is executed, then the real file is opened
  5. [hypothesis] The virus installs itself
  6. [hypothesis] The virus manages to watch for new USB drives

The last point is easy to check: Insert a clean drive and observe: files will quickly be replaced by shortcuts.

In fact the virus remains in memory. Speaking of memory, it consumes quite a lot of it&#8230; Around 1/2GB!

<div id="attachment_347" style="width: 310px" class="wp-caption aligncenter">
  <a href="https://blog.jtlebi.fr/wp-content/uploads/2013/11/iTuneHelper-4-resources.png"><img class="size-medium wp-image-347" alt="iTunesHelper, quite a lot of memory !" src="https://blog.jtlebi.fr/wp-content/uploads/2013/11/iTuneHelper-4-resources-300x292.png" width="300" height="292" /></a>
  
  <p class="wp-caption-text">
    iTunesHelper, quite a lot of memory !
  </p>
</div>

When the computer is rebooted, the virus is reloaded with it via the registry. Even more Ironic, being a script ran by &#8220;wscript.exe&#8221; from Microsoft, its is reported as a Microsoft program. Trustworthy? Simple and efficient.

**3/ Counter measures, cleaning**

All these informations gathered It is also possible to guess a way to efficiently get rid of it:

  1. Remove any USB drive from the computer
  2. Kill any &#8220;wscript.exe&#8221; process, especially if it eats up all your memory !
  3. Disable further automatic restarts. A tool like CCleaner will help. It will also give the path to the resident payload
  4. Delete the resident Payload
  5. Show system protected files
  6. For each infected drive: 
      1. Insert it. DO NOT open _any_ file from it
      2. Delete iTunesHelper.vbe along with _ALL_ shortcuts
      3. Reset files to regular attributes
  7. Hide system protected files

Which also appears to be quite close from the real uninstall procedure, hardcoded in the virus.

**4/ Last word**

This Post dived into a virus from a purely qualitative point of view, following the same general approach the author used to quickly get rid of this file. All the informations from this post have been cross-verified against the virus source code which appears to be only poorly obfuscated. But that's another topic, for a future post.

This virus has been reported to an antivirus editor. Hopefully it's signature will quickly be added to official databases.
  
[
  
For a more technical approach, please read on: second part.][1]

 [1]: https://blog.jtlebi.fr/2013/11/21/anatomy-of-a-virus-ituneshelper-vbe-22/ "Anatomy of a virus: iTunesHelper.vbe 2/2"