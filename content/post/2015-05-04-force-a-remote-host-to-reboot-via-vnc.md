---
title: Force a remote host to reboot via VNC
author: Jean-Tiare Le Bigot
layout: post
date: 2015-05-04
url: /2015/05/04/force-a-remote-host-to-reboot-via-vnc/
categories:
  - quickndirty
  - Sysadmin
tags:
  - kvm
  - quickndirty
  - reboot
  - sysrq
  - vnc
---
Yesterday, dealt with a machine in a pretty bad state:

  * SSH was Down
  * Memory was exhausted (OOM)
  * Ctrl + Alt + Del from VNC was not responding
  * A background operation on the OpenStack API was preventing any `nova reboot --hard zombie-essential-instance.my-infra.net`

In such situations, the last resort is `Alt+SysRQ+b` to force the host into immediate reboot, possible loosing or corrupting data data in the way.

The trick is that, obviously, you can not type this sequence on your laptop as usual, or the machine that will reboot will not be the one you expect&#8230; Hence to goal is to feed the relevant keycodes directly to VNC. [As VNC has originally been built specifically for X11][1], the keycodes you need to send are the one X11 itself uses internally. Which are found [in the source code][2].

Long story short, the codes you are looking for are:

  * `0xffe9`: Alt
  * `0xff15`: SySRq
  * `0x0062`: b

If you are viewing the console through NoVNC, you may feed theses codes to the guest by opening a console in your browser (`F12` in most browser) and typing:

<pre class="brush: jscript; title: ; notranslate" title="">rfb.sendKey(0xffe9, 1);
rfb.sendKey(0xff15, 1);
rfb.sendKey(0x0062, 1);
rfb.sendKey(0x0062, 0);
rfb.sendKey(0xff15, 0);
rfb.sendKey(0xffe9, 0);
</pre>

This will send the relevant key down events then the key up in reverse order. This is roughly how the &#8220;Send CtrlAltDel&#8221; button works.

 [1]: http://www.realvnc.com/docs/rfbproto.pdf
 [2]: http://www.cl.cam.ac.uk/~mgk25/ucs/keysymdef.h