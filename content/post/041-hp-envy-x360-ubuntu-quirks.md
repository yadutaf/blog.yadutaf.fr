---
title: "Getting Linux to work on HP Envy x360"
author: Jean-Tiare Le Bigot
layout: post
date: 2023-02-11
url: /2023/02/11/hp-envy-x360-ubuntu-quirks/
categories:
  - Sysadmin
tags:
  - linux
  - ubuntu
  - hardware
---

**TL;DR**: If you are here just for the fix (Which I would if I was you), the actual
fixes are at the bottom of the post. Just search "TL;DR".

After 8 years, my Haswell-era laptop was showing sign of age. While the CPU was never
really a blocking point, despite being a low-power variant, the RAM had been the maximum
of 12 GB for a couple of years and, modern apps being what they are, it was no longer
possible to run Firefox alongside and a virtual machine. A choice had to be made
between the experimentation environment and the documentation. Not ideal.

Aside from this, the screen was proudly exposing its scars and the Bluetooth device
convinced me that, to listen to music, the best was to use a smartphone instead.

The time had come to select a new tool for the years to come. It had to be reasonably
nice visually, have a good processor, at least 16 GB of memory and 1 TB of NVMe, ideally
a decent screen to watch movies (Yeah, I know, not only coding. So weird.) and, more
importantly be future-proof. By future-proof, I mean that the target machine had to be
modern enough to not be obsolete from day-1 and be upgrade-able, i.e. no soldered RAM
modules.

I went for, you guessed it, an HP Envy x360 with an OLED screen and hoped for the best.

### First experience

After struggling with Chronopost (A traditional French rite of passage), I finally received
the machine, only 1 week after ordering it. Not bad for Chrono-delays.

Quite surprisingly, a live Ubuntu 22.10 just worked. The Alder Lake GPU was correctly
detected, the sound and Bluetooth was working out of the box, video play was smooth,
switching to tablet mode was a bit quirky as it was entering plane mode at the same time
but nothing too terrible for such modern hardware. Looks like hardware vendors managed
to enable everything. Even though I forgot to test it before installing, the Webcam also
was a good surprise and worked out of the box. Really cool.

So let's install it with full disk encryption, enroll MOK keys and reboot!

I said 'reboot', not 'go to black screen after Grub'. I said... Whatever.

### Getting things to work

Back to reality. While the live-usb was working just fine, the installed system was just
turning off the screen. Pretty counter-intuitive.

After trying multiple dead-ends, variants of installer incantation and noticing that the
too famous `nomodeset` kernel parameter was at least getting a display to work, without
any acceleration of course, I sat down and stopped random-engineering.

I knew for a fact that the graphical stack, including the display was working just fine
on the live USB. When installing the exact same code without applying any upgrades the
display was broken. Given this, the only possible differences were the Grub configuration
file the initrd. That is to say, the 2 dynamically generated parts in the boot process.

Ruling out grub.cfg was fortunately easy. Merely a matter of trimming it to match the
live USB variant. Which is, a much, much, shorter file. Guess which variant was
hand-crafted.

Running `unmkinitramfs` on both the Live USB initrd and the installed system's initrd
quickly revealed that the graphical drivers and firmware were simply not there... on the
installed system. Just adding `i915` to the list of modules to inject in the initrd did
not help, likely because it only brought the drivers, without the code to actually use it.
However, `FRAMEBUFFER=y` and re-generating the initrd did the trick. And I'm still amazed
that I can boot my machine.

While I was having dinner with my wife and children, the machine went to sleep. One would
think it legitimately got bored out. But it then expressed it discontent by throwing a
colorful pixel salad at me. Read: This infamous screen flickering.

Hopefully, after some searches, I found a list of ~10 incantations to try on the driver
in sequence to hopefully get it to cooperate. That was a bit frightening since the test
cycle involves configuring Grub, rebooting, triggering suspend and trying the next
combination via SSH, should the "pixel salad" come back.

This time, I got lucky, the first incantation was the one: Adding
`i915.enable_psr=0 i915.enable_fbc=1` to the kernel command line. This disabled the "Panel
Self Refresh", which is unfortunately a power saving feature while forcing on the frame
buffer compression, which is also a power saving feature. At least, nothing too
terrible like limiting the sleep states.

With these small fixes, the biggest hurdles were behind me. There remained this issue
with the screen (it, again) where the transition from regular laptop to tablet was
entering plane mode (and sometime also exiting it). Nothing terrible, at least the
workaround is easy (just turn the network back on), but not ideal ideal.

Surely, there is a way to handle this?

It turns out, there is. This was the occasion to familiarize myself with the huge
modernization efforts around input handling in Linux and discover "libinput" (don't
laugh at me. It's rarely needed to build a Linux distribution for a self-driving car :))

Running `sudo libinput debug-events` confirmed that `KEY_RFKILL` was being repeatedly
"pressed" when rotating the screen. Ironically, now that I look at it, this machine
terribly *lacks* such a key. And it would have been a great addition.

The real important information was that this event was sent by 'event16' better known
as "Intel HID events" in this specific machine. After reading some very helpful
libinput documentation and running a couple of commands, I was able to mute this ghost
key with a custom quirk file and a reboot.

In the process, I quickly came to realize that using the "Function" keys required to
hold the `Fn` key simultaneously. Of course, there is no keyboard "Fn lock" or equivalent,
but this was easily toggled from the BIOS.

With all this, there remains only 1 itch to scratch (at least for now) for which I have
no lead. At the same time, I'm not sure if it's painful enough for me to spend more time
on it. Namely, going from laptop to tablet work just fine. However, when doing the
opposite, the screen remains "upside-down". Converting back to tablet and back again to
laptop does the trick and feels like a very acceptable workaround for me.

### Getting it all together (aka: TL;DR)

#### Fixing the black screen on boot:

```
echo 'FRAMEBUFFER=y' | sudo tee /etc/initramfs-tools/conf.d/hp-envy-x360-quirk
sudo update-initramfs -c -k all 
```

#### Fixing the screen flickering after suspend / sleep:

```
echo 'GRUB_CMDLINE_LINUX_DEFAULT="quiet splash i915.enable_psr=0 i915.enable_fbc=1"' | sudo tee /etc/default/grub.d/hp-envy-x360-quirk.cfg
sudo update-grub
```

#### Fixing ghost "rkfill" events when rotating the screen:

```
cat <<EOF | sudo tee -a /etc/libinput/local-overrides.quirks
[HP Envy x360 ew0xxx IntelHID]
MatchName=Intel HID events
MatchDMIModalias=dmi:*svnHP:pnHPENVYx360*
AttrEventCodeDisable=EV_KEY:0xf7;
EOF

systemctl reboot
```

**Warning**: The syntax of this file is NOT stable. Actually, the version on "main"
branch would need something like `AttrEventCode=-EV_KEY:0xf7;` at the time of writing.

#### Toggling "Fn Lock" to get the F1-F12 by default:

* Enter the BIOS/UEFI Setup utility
* Set "Action key mode" to "Enabled"
* Save and reboot

### Conclusion

5 days after receiving this new machine, It's a surprisingly good experience. Surely,
there were some troubles during the bringup, but all had a solution, and, let's face it:
I truly enjoyed the challenge (had it failed, this would be a completely different
story...).

And this post is written from my new machine. Farewell Haswell-era laptop, and thanks
for all these years!
