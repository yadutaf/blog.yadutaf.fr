---
title: "Mounting overlay filesystems with libguestfs"
author: Jean-Tiare Le Bigot
layout: post
date: 2021-05-29
url: /2021/05/29/mounting-overlay-with-libguestfs/
categories:
  - Sysadmin
tags:
  - linux
  - virtualization
---


[libguestfs](https://libguestfs.org/) is a set of tools for accessing and modifying virtual machine (VM) disk images. It can typically inject files in VM images, create or modify partitions, set partition labels and even expose the VM image content on a host mountpoint all this without root access.

Under the hood, libguestfs spawns a Qemu/KVM virtual machine with all needed tools and relies on Fuse to expose the filesystem to a non privileged user mountpoint.

### Mount a VM image partition on the host

The easiest way to expose an existing partition from an existing image is to use `guestmount`. For example, if we wanted to mount an Ubuntu install image, we could use commands like:

```bash
# Prepare the mountpoint
mkdir -p ./ubuntu-mountpoint

# Mount the main partition
guestmount --ro -a ubuntu-21.04-desktop-amd64.iso -m /dev/sda1 ./ubuntu-mountpoint

# Do something with the mountpoint
ls ./ubuntu-mountpoint

# Umount
umount ./ubuntu-mountpoint
```

Likewise, to mount the "EFI" partition, we could use `/dev/sda2` in place of `/dev/sda1`.

### Assemble a typical rootfs from a VM image on the host

If we now want to faithfully expose a VM image partition layout on the host rather than single partitions, we now need to use the lower level yet user-friendly `guestfish` command. In a nutshell, `guestfish` is high level shell for image manipulation. It can do anything from partition creation to file modification. It can also start a Fuse loop to expose a filesystem. This last feature makes it possible to fully replicate what `guestmount` does in a much more flexible way.

For example, let's say we just used the Ubuntu ISO image above to install a minimal Ubuntu Desktop. In the default configuration, the installer creates 2 partitions:

1. An `ext4` filesystem for the rootfs
2. A `vfat` partition labeled “ESP” for the UEFI bootloader typicaly mounted on `/boot/efi`

Using `guestfish`, we can replicate this mount hierarchy and expose it on the host.

First, start guestfish on the installed image:

```bash
guestfish -a ./installed-ubuntu-21.04.qcow2
```

When the `><fs>` prompt appears, type `run` to start the underlying virtual machine. This may take a couple of seconds. Guestfish is now ready.

```
Welcome to guestfish, the guest filesystem shell for
editing virtual machine filesystems and disk images.

Type: ‘help’ for help on commands
      ‘man’ to read the manual
      ‘quit’ to quit the shell

><fs> run
><fs>
```

We can then mount the rootfs and the EFI partitions:

```
><fs> mount /dev/sda3 /
><fs> mount /dev/sda2 /boot/efi/
```

At this stage, the rootfs is fully mounted. It can be explored from Guestfish with, say `ls /boot/efi/EFI` or similar commands. It is however not yet visible from the host.

To expose the assembled rootfs on the host, we need to configure the mountpoint and start the main Fuse loop:

```
><fs> mount-local ./ubuntu-mountpoint
><fs> mount-local-run
```

Once `mount-local` succeeded, the mountpoint is exposed on the host. However, since the main loop is not yet running, all file access will block. The next command `mount-local-run` starts the main loop and unlocks all pending file access. This function will block until interrupted or the filesystem is unmounted from the host.

We can now access the assembled rootfs from the host. And un-mount it like before to close the Fuse loop.

```bash
ls ./ubuntu-mountpoint/boot/efi/EFI
umount ./ubuntu-mountpoint
```

And finally, do some clean-up on the guestfish side:

```
><fs> umount /boot/efi/
><fs> umount /
><fs> exit
```

### Assemble an overlay rootfs from a VM image on the host

Things get more complicated when faithfully exposing the VM image partition layout involves an overlay. There is no high-level Guestfish command for this use-case. It is however possible to 'hack around'.

Overlays can be used in multiple scenarios. In OS context, they are typically used when the main rootfs is read-only such as an ISO image or signed image while still needing to capture changes like for a live-usb image or to provide an easy “Reset to factory settings” feature on an IoT device.

Let's leave aside the Ubuntu image example and consider a scenario with a read-only squashfs sda1 partition and a read-write ext4 sda2 partition with the following layout:

```
./image.qcow2
├─sda1        → Arbitrary filesystem structure
└─sda2
  ├─/workdir  → Overlay work directory
  └─/upper    → Overlay upper directory (where the changes are recorded)
```

We start by spawning the guestfish VM like before:

```bash
guestfish -a ./installed-ubuntu-21.04.qcow2

Welcome to guestfish, the guest filesystem shell for
editing virtual machine filesystems and disk images.

Type: ‘help’ for help on commands
      ‘man’ to read the manual
      ‘quit’ to quit the shell

><fs> run
><fs>
```

We then need mount our 2 partitions on 2 intermediates mountpoints:

```
><fs> mkmountpoint /rootfs
><fs> mkmountpoint /overlay
><fs> mount /dev/sda1 /rootfs
><fs> mount /dev/sda2 /overlay
```

Once both partitions are ready, we can finally assemble the rootfs. This is the tricky part:

```
><fs> mount-vfs lowerdir=/sysroot/rootfs,upperdir=/sysroot/overlay/upper,workdir=/sysroot/overlay/workdir overlay /dev/sda /
```

There are a couple of comments to make on this command.

First of all, we no longer use the `mount` command but the `mount-vfs` command. This command allows specifying all mount options that we need.

Then, we specify `/dev/sda` as the device to mount where we would typicaly use a placeholder like 'overlay' with Linux' stock `mount` command. While it is not used and will not be touched directly by this command, the high level ``mount-vfs`` command zealously validates that the specified device exists. We thus need a real device.

Last but not least, `lowerdir`, `upperdir` and `workdir` all have a `/sysroot/` prefix. Internally, what guestfish exposes as the `/` is actually `/sysroot`. All high level commands then handle the prefixing under the hood. However, in this case, the command goes directly to the VM kernel which knows nothing about this prefixing. We thus need to be explicit about it.

We can now start the Fuse loop as before:

```
><fs> mount-local ./host-mountpoint
><fs> mount-local-run
```

Once unmounted from the host, we now need to manually unmount the partition from guestfish. This is important because guestfish does not know about overlays and would not otherwise umount the partitions in the proper order:

```
><fs> umount /
><fs> umount /overlay
><fs> umount /rootfs
```

Et voilà! We now have a way to expose on the host complex VM rootfs involving overlays. All this without `root` nor `sudo` access !

### Bonus: Use guestfish as a script interpreter to automate this:


```
#!/usr/bin/guestfish -f
add ./image.qcow2
run
mkmountpoint /rootfs
mkmountpoint /overlay
mount /dev/sda1 /rootfs
mount /dev/sda2 /overlay
mount-vfs lowerdir=/sysroot/rootfs,upperdir=/sysroot/overlay/upper,workdir=/sysroot/overlay/workdir overlay /dev/sda /
mount-local ./host-mountpoint
mount-local-run
umount /
umount /overlay
umount /rootfs
```

Then set the file as executable and profit 😉
