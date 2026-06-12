---
title: "Introduction to UEFI HTTP(S) boot with Qemu/OVMF"
author: Jean-Tiare Le Bigot
layout: post
date: 2026-06-12
url: /2026/06/12/introduction-to-uefi-https-boot-qemu-ovmf/
categories:
  - Sysadmin
tags:
  - qemu
  - ovmf
  - boot
---

The historic go-to solution for network booting is PXE. PXE is based on DHCP and
TFTP. It is tricky to correctly configure, even trickier to make it highly available and
good luck with the security with this clear-text unsigned protocol.

The modern web has long standardized on HTTPS with TLS certificates for server authentication,
integrity and confidentiality. Moreover, highly available setups are a solved problem when
it comes to HTTPS. Even better, the encryption layer makes it practical to boot over the
Internet without immediately facing the threat of a man-in-the-middle attack that would be
trivial with TFTP (remember, the leading `t` stands for "trivial", not "secure").

The good news is, most modern UEFI-based system support booting over HTTP(S).

In this post, we'll boot the snponly variant of [netboot.xyz](https://netboot.xyz/) directly
from the official website. Be prepared for some fun with HTTPS.

All these tests were performed on Ubuntu 26.04 with the provided 1:10.2.1+ds-1ubuntu3 Qemu
and 2025.11-3ubuntu7 OVMF packages, unless otherwise stated. Note that, for reasons that will
become clear later in this post, older versions might actually work better 🙃.

### Starting with the simple case: HTTP boot discovered over DHCP

(Righteously) Suspecting that the HTTPS variant would be a tough beast to beat, I started
this journey with a first test that side steps the certificate trust and other quirks at the
beginning.

The URL for the boot firmware is: http://boot.netboot.xyz/ipxe/netboot.xyz-snponly.efi.

The aim here is to demonstrate a minimal setup to make it easier to integrate it in your own
environment. We'll use a non-root Qemu machine with userland-based SLIRP networking and no
additional devices like storage for instance. The whole system will run in-memory.

Let's start with a first iteration based on:
- The OVMF firmware, without secure boot to keep things simple
- A network card that will emulate a DHCP server and point the UEFI to the HTTP boot target
- Output on the console

```bash
qemu-system-x86_64 \
    -drive if=pflash,format=raw,readonly=on,file=/usr/share/OVMF/OVMF_CODE_4M.fd \
    -nic user,bootfile=http://boot.netboot.xyz/ipxe/netboot.xyz-snponly.efi \
    -nographic
```

This is promising, but it fails to boot over the network:

```
BdsDxe: No bootable option or device was found.
BdsDxe: Press any key to enter the Boot Manager Menu.
```

This is because the network stack in the OVMF requires a random number generator device to
work. When you think about it, this is almost obvious. Pretty much each layer of the network
stack requires randomness, from Ethernet collision avoidance to TLS through DHCP itself.

This can be enabled very easily by adding the following flag to the Qemu command line:

```bash
-device virtio-rng-pci
```

Any other configuration change that would provide a random number generator would work equally
well. For example, one could enable KVM and use `-cpu host` which would grant access to the CPU's
random number generation instructions.

While somewhat obvious, this is pretty hard to figure out without help because of the lack of
error logs. In this case, I was helped by asking the free version of Claude.

I was wondering how one could figure this out by induction/deduction rather than brute-forcing
it with a (very helpful) LLM. It turns out the dependency is declared in the `[Depex]` section
of `NetworkPkg/Library/DxeNetLib/DxeNetLib.inf`:

```ini
[Depex]
  gEfiRngProtocolGuid
```

Under the hood, this pushes the GUID of the EFI random number generation protocol on the
dependency stack so that any EFI package linking against the `DxeNetLib` will implicitly require
it when the dispatcher evaluates the dependencies at runtime.

For future reference (to myself), one could work out the dependency at runtime from the
debug logs by enabling the "DEBUG_DISPATCH" flag of `gEfiMdePkgTokenSpaceGuid.PcdDebugPrintErrorLevel`
in `OvmfPkg/OvmfPkgX64.dsc`. Be prepared for a world of GUID based debugging!

(If you are frustrated by the brute-force approach and would rather see a log-based approach,
stay tuned for the HTTPS part.)

With this in place, tadaa!

```
>>Start PXE over IPv4.
  Station IP address is 10.0.2.15

  Server IP address is 10.0.2.2
  NBP filename is http://boot.netboot.xyz/ipxe/netboot.xyz-snponly.efi
  NBP filesize is 0 Bytes
  PXE-E23: Client received TFTP error from server.
BdsDxe: failed to load Boot0002 "UEFI PXEv4 (MAC:525400123456)" from PciRoot(0x0)/Pci(0x3,0x0)/MAC(525400123456,0x1)/IPv4(0.0.0.0,0x0,DHCP,0.0.0.0,0.0.0.0,0.0.0.0): Not Found

>>Start PXE over IPv6.
  PXE-E16: No valid offer received.
BdsDxe: failed to load Boot0003 "UEFI PXEv6 (MAC:525400123456)" from PciRoot(0x0)/Pci(0x3,0x0)/MAC(525400123456,0x1)/IPv6(0000:0000:0000:0000:0000:0000:0000:0000,0x0,Static,0000:0000:0000:0000:0000:0000:0000:0000,0x40,0000:0000:0000:0000:0000:0000:0000:0000): Not Found

>>Start HTTP Boot over IPv4....
  Station IP address is 10.0.2.15

  URI: http://boot.netboot.xyz/ipxe/netboot.xyz-snponly.efi
  File Size: 310784 Bytes
  Downloading...100%BdsDxe: loading Boot0004 "UEFI HTTPv4 (MAC:525400123456)" from PciRoot(0x0)/Pci(0x3,0x0)/MAC(525400123456,0x1)/IPv4(0.0.0.0,0x0,DHCP,0.0.0.0,0.0.0.0,0.0.0.0)/Uri()
BdsDxe: starting Boot0004 "UEFI HTTPv4 (MAC:525400123456)" from PciRoot(0x0)/Pci(0x3,0x0)/MAC(525400123456,0x1)/IPv4(0.0.0.0,0x0,DHCP,0.0.0.0,0.0.0.0,0.0.0.0)/Uri()
iPXE initialising devices...
autoexec.ipxe... ok



iPXE 2.0.0+ (g36e8c) -- Open Source Network Boot Firmware -- https://ipxe.org
Features: DNS HTTP HTTPS iSCSI NFS TFTP VLAN AoE EFI Menu
netboot.xyz - v3.x
Hit the m key to open failsafe menu...
```

Did I mention that reaching this point takes ~1m 15s? 🐌

### Speeding up HTTP boot, through configuration

One minute just to reach the one boot attempt we are interested in is horribly long and
not anywhere near an acceptable target. Now that it works, we can try to make it fast.
The good news is that it is relatively easy.

The UEFI network stack sequentially tries:

1. IPv4 PXE: The IPv4 part works, but the HTTP URL is invalid, a TFTP reference is expected.
2. IPv6 PXE: Nothing works as no IPv6 is configured.
3. IPv4 HTTP: This finally works.
4. IPv6 HTTP: This would have been the following attempt.

Ideally, we would need a mechanism to instruct the OVMF to avoid losing time on the legacy
PXE stuff.

Fortunately, Qemu has a way to pass options to the firmware using the `-fw_cfg` flag and
(some) documentation of the available OVMF settings is even available here:
https://github.com/tianocore/edk2/blob/master/OvmfPkg/RUNTIME_CONFIG.md

From the documentation, we can find good candidates:

- `opt/org.tianocore/IPv4PXESupport`
- `opt/org.tianocore/IPv6PXESupport`

We can even see `etc/edk2/https/cacerts`. This might come in handy for the next part. Who knows?

Wiring it all together, the final Qemu command line for HTTP boot looks like:

```bash
qemu-system-x86_64 \
    -device virtio-rng-pci \
    -drive if=pflash,format=raw,readonly=on,file=/usr/share/OVMF/OVMF_CODE_4M.fd \
    -nic user,bootfile=http://boot.netboot.xyz/ipxe/netboot.xyz-snponly.efi \
    -fw_cfg name=opt/org.tianocore/IPv4PXESupport,string=no \
    -fw_cfg name=opt/org.tianocore/IPv6PXESupport,string=no \
    -nographic
```

This will boot to netboot.xyz in roughly 5 seconds, which is far more acceptable.

### Another way to HTTP boot, through UEFI variables

We have reached a point that works but is hard to transpose to real hardware. On real
hardware, we do not have these convenient OVMF runtime tunables. What we have instead
are UEFI variables. Could we achieve the same replacing Qemu trickery with UEFI variables?
Ideally, we would need to pre-generate the variables before the first start of the VM
to reach parity with the previous approach.

(OK, OK, the real reason for this alternative is to smooth the path a bit to the HTTPS
variant.)

Ideally, we'd place the variables in a human-readable configuration file
would be the dream solution. Wait, did I say human-readable? Yes, Qemu has it since
10.0 and we have 10.2.1. See https://github.com/tianocore/edk2/blob/master/OvmfPkg/QEMU_PV_VARS.md.

Of course, the option is not enabled in the OVMF build in Ubuntu and I do not want to
rebuild the OVMF. That's too much of a hassle. (Remember, we are only at the easy HTTP step).

Fortunately, `virt-fw-vars` from https://gitlab.com/kraxel/virt-firmware can inject a "Next
Boot URI" directly into an `OVMF_VARS_4M.fd` EFI variable store:

```bash
# Install firmware tools
sudo apt install python3-virt-firmware

# Inject the "Next Boot entry" in a fresh variable store
virt-fw-vars --input /usr/share/OVMF/OVMF_VARS_4M.fd --set-boot-uri http://boot.netboot.xyz/ipxe/netboot.xyz-snponly.efi --output ./OVMF_VARS_4M.fd

# Boot the VM
qemu-system-x86_64 \
    -device virtio-rng-pci \
    -drive if=pflash,format=raw,readonly=on,file=/usr/share/OVMF/OVMF_CODE_4M.fd \
    -drive if=pflash,format=raw,file=./OVMF_VARS_4M.fd \
    -nic user \
    -nographic
```

With this, we can boot a VM over HTTP with two methods:

1. The first, using DHCP bootfile.
2. The second by crafting the next boot UEFI variable.

Ready for adding the "S" in HTTPS?

### UEFI HTTPS boot: Merely a matter of adding an "s"?

Surely, this is as simple as replacing "http://" with "https://" in at least one of the variants?

Not quite.

The DHCP/bootfile-based approach fails after a horribly long ~1m timeout with the
following message:

```
>>Start HTTP Boot over IPv4.....
  Error: Could not retrieve NBP file size from HTTP server.

  Error: Server response timeout.
BdsDxe: failed to load Boot0004 "UEFI HTTPv4 (MAC:525400123456)" from PciRoot(0x0)/Pci(0x3,0x0)/MAC(525400123456,0x1)/IPv4(0.0.0.0,0x0,DHCP,0.0.0.0,0.0.0.0,0.0.0.0)/Uri(): Not Found
```

At least the var store variant is faster to fail, roughly 5s:

```
>>Start HTTP Boot over IPv4....
  Station IP address is 10.0.2.15

  URI: https://boot.netboot.xyz/ipxe/netboot.xyz-snponly.efi

  Error: Could not retrieve NBP file size from HTTP server.

  Error: Unexpected network error.
```

None of these error messages are actionable. The only valuable hint here is that the var store
variant at least succeeds in getting an IP address and finding the next boot URL. Regarding the
failure of the DHCP-based approach, I honestly have no clue why it failed.

This will clearly not only be a matter of adding the "s" in "https".

### The hunt for logs

EDK II/OVMF firmware conveniently produce debug logs on a specific virtual serial port. Fortunately,
Gerd Hoffmann (incidentally also the author/maintainer of `virt-fw-vars` we used earlier) recently
documented the correct incantation on his blog: https://www.kraxel.org/blog/2025/10/firmware-logging/.

Let's do this, add `-device isa-debugcon,iobase=0x402,chardev=fw -chardev file,id=fw,path=debug.log`
to the Qemu command line and check the logs.

Here is the full output:

```
```

Yes, you read it correctly. There is no mistake. There is nothing. At all.

This is because this only works with DEBUG builds of OVMF and we have a RELEASE build. This makes
sense, but Ubuntu does not ship such a build. We have no choice but to rebuild it ourselves.

For this, I took the easy path. I fetched the package sources and re-used the `debian/rules`
Makefile. Deb packages can be a painful beast, but building OVMF correctly is also an
interesting experience. If others did the hard job of doing the correct setup and finding a good
combination of build flags, I will surely not second-guess them.

```bash
sudo apt install devscripts
sudo apt build-dep ovmf
apt-get source ovmf
cd edk2-2025.11
make -f debian/rules build-ovmf-no-secboot BUILD_TYPE=DEBUG
```

The important part above is `BUILD_TYPE=DEBUG`. This is a variable specific to the Debian packaging
but it is then forwarded as needed to the OVMF build system.

Let's plug this firmware in our Qemu command line and check how it goes:

```bash
# Initialize the var store (always needed, as this is next boot only)
virt-fw-vars --input /usr/share/OVMF/OVMF_VARS_4M.fd --set-boot-uri https://boot.netboot.xyz/ipxe/netboot.xyz-snponly.efi --output ./OVMF_VARS_4M.fd

# Boot with the debug FW and flags
qemu-system-x86_64 \
    -device virtio-rng-pci \
    -drive if=pflash,format=raw,readonly=on,file=edk2-2025.11/debian/build/ovmf/no-secboot/Build/OvmfX64/DEBUG_GCC5/FV/OVMF_CODE.fd \
    -drive if=pflash,format=raw,file=./OVMF_VARS_4M.fd \
    -nic user \
    -device isa-debugcon,iobase=0x402,chardev=fw \
    -chardev file,id=fw,path=debug.log \
    -nographic
```

Habemus logs!

Let's grep them for 'tls':

```
Loading driver at 0x0000672A000 EntryPoint=0x00006730B3B TlsAuthConfigDxe.efi
Loading driver at 0x00006397000 EntryPoint=0x0000646255F TlsDxe.efi
TLS Certificate is not found on the system!
TlsDoHandshake SSL_HANDSHAKE_ERROR State=0x4 SSL_ERROR_SSL
TlsDoHandshake ERROR 0xA000086=L14:R86 tls_post_process_server_certificate():
```

The elephant in the room is right in the middle: We have not provided any CA certificates to
trust and OVMF does not bundle its own list like a network browser would.

### Providing a list of CA certificates to trust

In retrospect, this part is surprisingly easy. The first control knob in the
[RUNTIME_CONFIG.md](https://github.com/tianocore/edk2/blob/master/OvmfPkg/RUNTIME_CONFIG.md)
we saw earlier happened to be `etc/edk2/https/cacerts`. Granted, we will have to get back
to some `fw_cfg` trickery, but this could also (maybe?) be done by setting the `TlsCaCertificate`
UEFI variable (see [TlsAuthConfigLib.c](https://github.com/tianocore/edk2/blob/master/OvmfPkg/Library/TlsAuthConfigLib/TlsAuthConfigLib.c)).

This variable is not part of the UEFI specification, which I find puzzling because providing
a controlled list of trusted CA certificates looks like a very valid need in a secure boot
environment. At least, the main layer of defense with the EFI signature is still there. But,
I honestly wonder how firmware implementation in the field really handles this (and I'm not
crazy enough to test it on my main laptop).

Indeed, one of the rare resource about this variable seems to be spread over two text
files in edk2. Both hint at a different way to generate a valid bundle, respectively
addressing a different use case:

- [OvmfPkg/RUNTIME_CONFIG.md](https://github.com/tianocore/edk2/blob/master/OvmfPkg/RUNTIME_CONFIG.md)
  suggests to use `virt-fw-sigdb` to generate a tailored list with only a specific list of
  trusted certificates.
- [OvmfPkg/README](https://github.com/tianocore/edk2/blob/master/OvmfPkg/README) on the other
  hand suggests to use `p11-kit` to convert the whole list of certificates trusted by system a
  re-use it as-is.

Let's go with the brutal approach, convert the whole bundle and try again:

```bash
# Convert the system bundle to a format suitable for OVMF
p11-kit extract --format=edk2-cacerts --filter=ca-anchors --overwrite --purpose=server-auth cacerts.bin

# Wire it in the Qemu command line
virt-fw-vars --input /usr/share/OVMF/OVMF_VARS_4M.fd --set-boot-uri https://boot.netboot.xyz/ipxe/netboot.xyz-snponly.efi --output ./OVMF_VARS_4M.fd
qemu-system-x86_64 \
    -device virtio-rng-pci \
    -drive if=pflash,format=raw,readonly=on,file=edk2-2025.11/debian/build/ovmf/no-secboot/Build/OvmfX64/DEBUG_GCC5/FV/OVMF_CODE.fd \
    -drive if=pflash,format=raw,file=./OVMF_VARS_4M.fd \
    -nic user \
    -fw_cfg name=etc/edk2/https/cacerts,file=cacerts.bin \
    -device isa-debugcon,iobase=0x402,chardev=fw \
    -chardev file,id=fw,path=debug.log \
    -nographic
```

Of course this still does not work, but at least this first warning is gone. We have the certificates.
Here is a grep of 'tls' in the debug logs:

```
Loading driver at 0x0000672A000 EntryPoint=0x00006730B3B TlsAuthConfigDxe.efi
Loading driver at 0x00006397000 EntryPoint=0x0000646255F TlsDxe.efi
TlsDoHandshake SSL_HANDSHAKE_ERROR State=0x4 SSL_ERROR_SSL
TlsDoHandshake ERROR 0xA000086=L14:R86 tls_post_process_server_certificate():
```

### Making sense of the TLS error

`TlsDoHandshake` produces two log lines. The first one basically tells that there was an error
— no kidding. The second one is a bit cryptic but tells more. Let's check the source code for clues:

```c
// from CryptoPkg/Library/TlsLib/TlsProcess.c
  if (Ret < 1) {
    Ret = SSL_get_error (TlsConn->Ssl, (int)Ret);
    if ((Ret == SSL_ERROR_SSL) ||
        (Ret == SSL_ERROR_SYSCALL) ||
        (Ret == SSL_ERROR_ZERO_RETURN))
    {
      DEBUG ((
        DEBUG_ERROR,
        "%a SSL_HANDSHAKE_ERROR State=0x%x SSL_ERROR_%a\n",
        __func__,
        SSL_get_state (TlsConn->Ssl),
        Ret == SSL_ERROR_SSL ? "SSL" : Ret == SSL_ERROR_SYSCALL ? "SYSCALL" : "ZERO_RETURN"
        ));
      DEBUG_CODE_BEGIN ();
      while (TRUE) {
        unsigned long  ErrorCode;
        const char     *Func;
        const char     *Data;

        ErrorCode = ERR_get_error_all (NULL, NULL, &Func, &Data, NULL);
        if (ErrorCode == 0) {
          break;
        }

        DEBUG ((
          DEBUG_ERROR,
          "%a ERROR 0x%x=L%x:R%x %a(): %a\n",
          __func__,
          ErrorCode,
          ERR_GET_LIB (ErrorCode),
          ERR_GET_REASON (ErrorCode),
          Func,
          Data
          ));
      }

      DEBUG_CODE_END ();
      return EFI_ABORTED;
    }
  }
```

This snippet produces the two log lines. The second line decomposes as:

- Error code: 0xA000086
- Library ID: 0x14 (20)
- Reason code: 0x86 (134)

The library ID is defined as follows in the vendored OpenSSL lib:

```c
// CryptoPkg/Library/OpensslLib/OpensslGen/include/openssl/err.h
# define ERR_LIB_SSL             20
```

In this context, the reason codes is defined as:

```c
// CryptoPkg/Library/OpensslLib/openssl/include/openssl/sslerr.h
# define SSL_R_CERTIFICATE_VERIFY_FAILED                  134
```

Great. So this tells us what we already knew. Or if we try to see the half-full glass, it
tells us that nothing fancy is fundamentally broken. We still have to figure out what's wrong
in the certificate validation though.

I turned to Claude to generate the missing logs. I could have fallen back to gdb based debugging
but I was not desperate enough to debug a firmware in Qemu. Here is the suggested code that I
inserted right after the last log line:

```c
        if (ERR_GET_LIB (ErrorCode) == ERR_LIB_SSL && ERR_GET_REASON (ErrorCode) == SSL_R_CERTIFICATE_VERIFY_FAILED)
        {
          long  X509Err = SSL_get_verify_result (TlsConn->Ssl);
          DEBUG ((
            DEBUG_ERROR,
            "%a X509_verify_result: %d (%a)\n",
            __func__,
            X509Err,
            X509_verify_cert_error_string (X509Err)
            ));
        }
```

A rebuild, Qemu restart and grep in the logs later, we have it:

```
TlsDoHandshake X509_verify_result: 66 (EE certificate key too weak)
```

EDK II considers the server key as "too weak" while my brand-new Ubuntu 26.04 and Firefox Nightly
browser are both perfectly fine. Frustrating...

### Fixing EDK II / OVMF

OpenSSL has a concept of "Security Levels". This security level controls accepted ciphers and key
lengths. The OpenSSL library bundled in Ubuntu 26.04 defaults to level 2. This level allows any RSA
key longer than 2048 bits, which happens to be the key type/size of the AWS-provisioned certificates
for https://boot.netboot.xyz/. Any higher level would require a longer/stronger key and thus reject
netboot's certificate.

Ironically, the OpenSSL library bundled in EDK II *also* defaults to security level 2. Unfortunately,
EDK II explicitly upgrades to level 3 by default in `CryptoPkg/Library/TlsLib/TlsInit.c`:

```c
  SSL_set_security_level (TlsConn->Ssl, 3);
```

This was changed from security level 0 approximately 9 months ago by https://github.com/tianocore/edk2/pull/11534.
Moving away from security level 2 IS a good idea. But it feels like the jump was a bit too high, especially
after [notifying the community about a jump to level 2, not level 3](https://edk2.groups.io/g/devel/topic/115039926).

In a world where everything were be possible, options could be:

- Upgrade https://boot.netboot.xyz/ to any other AWS CA. (All other CAs are compatible with security
  level 3, see https://www.amazontrust.com/repository). Unfortunately, this might break legacy applications.
- Mirror all needed binaries to a controlled domain. Probably a good idea for serious production, anyway.
- Patch EDK II.

Of course, since this is a hobby/discovery blog post, I went for the patch option. Indeed, I have
no control over netboot.xyz hosting and I absolutely do not want to craft a mirror with HTTPS just
for this. Did I mention I'm lazy?

Let's remove the snippet above, rebuild and test and...

Tadaaa!

```
>>Start HTTP Boot over IPv4....
  Station IP address is 10.0.2.15

  URI: https://boot.netboot.xyz/ipxe/netboot.xyz-snponly.efi
  File Size: 310784 Bytes
  Downloading...100%BdsDxe: loading Boot0099 "netboot netboot.xyz-snponly.efi" from Uri(https://boot.netboot.xyz/ipxe/netboot.xyz-snponly.efi)
BdsDxe: starting Boot0099 "netboot netboot.xyz-snponly.efi" from Uri(https://boot.netboot.xyz/ipxe/netboot.xyz-snponly.efi)
iPXE initialising devices...
autoexec.ipxe... ok



iPXE 2.0.0+ (g05a45) -- Open Source Network Boot Firmware -- https://ipxe.org
Features: DNS HTTP HTTPS iSCSI NFS TFTP VLAN AoE EFI Menu
netboot.xyz - v3.x
Hit the m key to open failsafe menu...
```

Getting further in the boot process is left as an exercise for the reader.

### Putting it all together

As a quick summary for those only interested in how to get it to work rather than the long post
(i.e., my future self), this section contains the minimal Qemu invocation for UEFI HTTP(S) booting.

**HTTP Boot - SLIRP/DHCP**:

```bash
qemu-system-x86_64 \
    -device virtio-rng-pci \
    -drive if=pflash,format=raw,readonly=on,file=/usr/share/OVMF/OVMF_CODE_4M.fd \
    -nic user,bootfile=http://boot.netboot.xyz/ipxe/netboot.xyz-snponly.efi \
    -fw_cfg name=opt/org.tianocore/IPv4PXESupport,string=no \
    -fw_cfg name=opt/org.tianocore/IPv6PXESupport,string=no \
    -nographic
```

Having a random number generator device is a hard requirement to load OVMF's network stack. This
is what `-device virtio-rng-pci` does. Use whichever device suits you need. Another way would be
`-cpu host` for instance.

The `-nic user,bootfile=...` can be replaced by any other network setup suiting your need where a
DHCP server would provide the `bootfile`. This example is just a quick mock.

The `fw_cfg` options are not strictly needed, but are essential to remove ~1 min worth of timeouts
from the boot. Similarly, `-nographic` is just here to ease the tests by staying in the console.

**HTTP Boot - Injecting UEFI VARS**:

```bash
# Inject the "Next Boot entry" in a fresh variable store
virt-fw-vars --input /usr/share/OVMF/OVMF_VARS_4M.fd --set-boot-uri http://boot.netboot.xyz/ipxe/netboot.xyz-snponly.efi --output ./OVMF_VARS_4M.fd

# Boot the VM
qemu-system-x86_64 \
    -device virtio-rng-pci \
    -drive if=pflash,format=raw,readonly=on,file=/usr/share/OVMF/OVMF_CODE_4M.fd \
    -drive if=pflash,format=raw,file=./OVMF_VARS_4M.fd \
    -nic user \
    -nographic
```

Most comments from the previous example apply.

The important difference here is that the `bootfile=...` is replaced by the injection of a `Boot0099`
UEFI variable along with an override of the `BootNext` variable. More advanced variants could inject
persistent configuration; however, this would require a bit more tooling.

**HTTPS Boot - Injecting UEFI VARS**

```bash
# Inject the "Next Boot entry" in a fresh variable store
virt-fw-vars --input /usr/share/OVMF/OVMF_VARS_4M.fd --set-boot-uri https://boot.netboot.xyz/ipxe/netboot.xyz-snponly.efi --output ./OVMF_VARS_4M.fd

# Convert the system bundle to a format suitable for OVMF
p11-kit extract --format=edk2-cacerts --filter=ca-anchors --overwrite --purpose=server-auth cacerts.bin

# Boot the VM
qemu-system-x86_64 \
    -device virtio-rng-pci \
    -drive if=pflash,format=raw,readonly=on,file=/usr/share/OVMF/OVMF_CODE_4M.fd \
    -drive if=pflash,format=raw,file=./OVMF_VARS_4M.fd \
    -nic user \
    -fw_cfg name=etc/edk2/https/cacerts,file=cacerts.bin \
    -nographic
```

Most comments from the two previous examples apply.

Two additional important caveats apply. 

First, a trusted certificate store is required. The OVMF does not come with a CA certificate store.
The easiest way to build one is by converting the system trust store with `p11-kit` as shown above.
An alternative is to create a tailored one with `virt-fw-sigdb`.

Second, out of the box and at the time of writing, OVMF requires certificates with a security level
of 3 and above. Most Linux distributions and OpenSSL itself currently default to level 2 so that the
download may work on the host and fail in the VM. If this is the case, make sure to check if the
server meets the proper requirements (see
[OpenSSL man page](https://docs.openssl.org/1.1.1/man3/SSL_CTX_set_security_level/#default-callback-behaviour)
for details). Alternatively, you can patch the firmware as done in this post.

### Conclusion

UEFI HTTPS boot is definitely possible, at least with a modern Qemu/OVMF. The only real quirk here
is the undocumented requirement of a Security Level 3 compliant TLS certificate on the server side.
This is probably a very good practice from a security perspective anyway.

This is really great news. Switching from TFTP that has been historically used for network booting
to HTTP already removes a lot of operational hurdles and eases building highly available setups
by leveraging existing tooling. Additionally, adding the TLS layer brings back the missing integrity
and confidentiality guarantees and thus paves the way to move critical boot components out of the trusted
network, possibly even to a remote location/Cloud.

Some parts I did not explore in this post are:
- Injecting the `TlsCaCertificate` in `OVMF_VARS_4M.fd` to avoid the `fw_cfg`. Beware of the "flash"
  size though.
- Injecting a persistent boot configuration rather than a BootNext-based configuration, essentially
  because it was way easier to follow this path.
- Checking why the SLIRP/DHCP variant did not work with HTTPS. Maybe it would with a real DHCP
  server.
- Trying to fully bypass the DHCP discovery and instead inject a static network configuration based
  on [UEFI Device Path Protocol](https://uefi.org/specs/UEFI/2.11/10_Protocols_Device_Path_Protocol.html#ipv4-device-path).
  Might be a good topic for another post. Who knows?

Qemu/OVMF proved a great way to experiment with UEFI HTTP boot and an unexpected occasion to dive
into OVMF code. And I'm very grateful for that.
