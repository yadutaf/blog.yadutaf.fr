---
title: "Introduction to Talos, the Kubernetes OS"
author: Jean-Tiare Le Bigot
layout: post
date: 2024-03-14
url: /2024/03/14/introduction-to-talos-kubernetes-os/
categories:
  - Sysadmin
tags:
  - kubernetes
  - talos
  - immutable
---

I recently came across [Talos](https://www.talos.dev/), an immutable OS for Kubernetes and
was immediately sold. Talos is precisely what I was striving to build during my 6+ (incredible)
years at [EasyMile](https://www.easymile.com) and it does it well and cleanly.

Talos is a minimalistic, secure by default, immutable OS for Kubernetes with transactional
upgrades, fully controlled through APIs (no SSH) with built-in secure-boot and TPM-anchored
disk encryption. While minimalistic and immutable, it still provides a powerful extension
system to support features like Kata-Containers or Nvidia drivers
([and many more](https://github.com/siderolabs/extensions)). In many ways, it reminds me
of CoreOS, which was [acquired by RedHat](https://techcrunch.com/2018/01/30/red-hat-acquirescoreos-for-250-million-in-kubernetes-expansion/?guccounter=1) for $250 million in 2018.

Did I mention that I was immediately sold?

### Talos key design principles

But wait, wait, why does any of this matter in the first place?

* **`Immutable`** means that most issues are reliably solved by the famous "Have you tried to
  turn it off and on again?". Runtime corruptions, temporary files issues, and a subset of persistent
  threats are efficiently mitigated. From an engineering perspective, it also makes it easier to
  reason about the system with no longer having to account for infinite possible variations. This
  is why most modern OS like Android, ChromeOS (which served as a foundation for CoreOS) are all
  immutable. Even mainstream Linux distributions like Ubuntu and Fedora are pursuing research
  efforts in this area.
* **`Transactional upgrades`** means that either an upgrade works, either it does nothing at all
  but never, ever, left the system in some "creative" random intermediate state. Ever experienced
  a broken system after loosing power at a crucial moment during an upgrade? This is what transactional
  upgrades solves. This property is the little brother of immutability property. Indeed, since the
  system can not be mutated, it can only be atomically replaced.
* **`Minimalistic`** means that the attack surface is also minimalistic and, more generally, that the
  opportunity of carrying bugs is mechanically reduced. Like the immutability, this also helps a
  lot with the engineering by making it easier to fit a mental model of the system in the head.
* **`API controlled`** means that the source of changes is gated, can be validated and opens the
  door to declarative system configuration. Sure it makes fixing system issues harder. It also
  reduces the likelihood of having something to fix in the first place 🙃. More importantly, the
  real feature is the removal of SSH and console shell. And this is key to system hardening as the
  general wisdom is that it only a matter of minutes before full system compromising when an attacker
  gains shell access. I actually spent myself more than 4 years deprecating shell access on a
  production system, precisely for this reason.
* **`Secure Boot`** (with operator-controlled keys) means that the platform can validate the authenticity
  and provenance of the code. This typically validates that the code has not been tampered with.
  Of course, it does validate that the code is bug-free and does not protect against downgrade attacks.
* **`TPM-anchored encryption`** means that data are both protected at rest (when the disk is powered off)
  and that the disk can only be unlocked by one specific machine. At runtime, data protection is brought
  by usual access control mechanism. Sadly, this part remains pretty hard to do on recent Linux systems
  and having out-of-the-box support in Talos is VERY valuable. Note that Talos does not yet provide
  "full disk encryption". The OS partition remains un-encrypted, which is acceptable since no one would
  store secrets there, right?

After having built, operated and supported production systems for more than 10 years, including
in regulated environments, none of this is solely academic. And none of these are easy to get right,
so that having these features built-in is very valuable.

Does it mean that Talos security is perfect? Well, no, of course not. It however comes with very decent
default security features and a pretty good documentation about them. For instance, a feature I'd love
to see is "remote attestation". When this is in place, the TPM of the machine generates a signed report
of its PCR registers state. Remote systems can then validate the state and gate access to sensitive
resources like a VPN server or secrets. The gain in security would be comparable as moving from pre-shared
keys (e.g. passwords) to hardware based authentication (e.g. credit cards, Yubikeys, ...).

### Features

Aside from the design principles listed above, Talos fully supports all operations related to Kubernetes
cluster operations. From cluster bootstrapping with built-in node discovery to Kubernetes version upgrades,
going through customizing the CNI.

As a secure by default system, it comes with a pre-configured
[Pod security admission controller](https://www.talos.dev/v1.6/kubernetes-guides/configuration/pod-security/)
that will prevent most basic privilege escalation, like running a container in privileged mode. Similarly,
RBAC is enabled by default as one would expect and XFS quotas are also enabled to control Pod's
ephemeral storage usage.

`talosctl` even features a (misnamed) `cluster` subcommand dedicated to spawning "lab" clusters.

### Lab

Speaking of cluster/lab subcommand, what about stopping to talk and giving it a try?

#### Quickstart

Let's start simple and run the simple case by blindly applying the cluster creation command provided in
[Talos' Quickstart guide](https://www.talos.dev/v1.6/introduction/quickstart/):

```
curl -sL https://talos.dev/install | sh # Don't do this it home (tm)
talosctl cluster create
```

The process is fully automatic and takes some time to complete. Once all is done, we have
`~/.kube/config` and `~/.talos/config` configuration files respectively suitable for use
by `kubectl` and `talosctl` commands.

On the system side, we also have 1 control plane node and 1 worker node. Not a HA setup,
but enough to run tests locally:

```
$> talosctl cluster show
PROVISIONER       docker
NAME              talos-default
NETWORK NAME      talos-default
NETWORK CIDR      10.5.0.0/24
NETWORK GATEWAY
NETWORK MTU       1500

NODES:

NAME                           TYPE           IP         CPU   RAM   DISK
talos-default-controlplane-1   controlplane   10.5.0.2   -     -     -
talos-default-worker-1         worker         10.5.0.3   -     -     -
```

Now from the Docker side:

```
$> docker ps
CONTAINER ID   IMAGE                             COMMAND        CREATED         STATUS         PORTS                                              NAMES
49ecbd4cc9b4   ghcr.io/siderolabs/talos:v1.6.6   "/sbin/init"   3 minutes ago   Up 3 minutes                                                      talos-default-worker-1
1eb8d4b51a37   ghcr.io/siderolabs/talos:v1.6.6   "/sbin/init"   3 minutes ago   Up 3 minutes   0.0.0.0:6443->6443/tcp, 0.0.0.0:50000->50000/tcp   talos-default-controlplane-1
```

And finally, from Kubernetes side:

```
$> kubectl get nodes -o wide
NAME                           STATUS   ROLES           AGE   VERSION   INTERNAL-IP   EXTERNAL-IP   OS-IMAGE         KERNEL-VERSION     CONTAINER-RUNTIME
talos-default-controlplane-1   Ready    control-plane   16h   v1.29.2   10.5.0.2      <none>        Talos (v1.6.6)   6.5.0-21-generic   containerd://1.7.13
talos-default-worker-1         Ready    <none>          16h   v1.29.2   10.5.0.3      <none>        Talos (v1.6.6)   6.5.0-21-generic   containerd://1.7.13
```

And if we check the running pods with `kubectl get pods -A` we can see the expected `kube-scheduler`, `kube-apiserver`, `kube-controller-manager`, `coredns` and `kube-flannel`. Indeed, the default (and only built-in)
CNI is Flannel. I'd rather have Cilium, more on this later.

#### Scaling up

While it is extremely easy to get a tiny cluster up and running in a matter of minutes, what if we need a
bigger cluster? A typical use-case for this would be to test HA scenarios in a home-lab.

It turns out, the cluster creation command is extremely flexible and can be largely customized.
For example, we could easily destroy the cluster with `talosctl cluster destroy` and re-spawn a
new one with 2 worker and 3 control plane nodes with `talosctl cluster create --controlplanes 3 --workers 3`.

While it would demonstrate the flexibility of the built-in provisioner, it would miss the opportunity
to dive a little deeper into the inner working of this provisioner and therefore miss the opportunity
to learn about scaling assumptions and built-in node discovery. Let's do this!

Unfortunately, `talosctl cluster` does not come with a scaling related sub-command. We'll need to do it
manually. There are 2 good resources to find the proper incantation:

1. Inspecting an existing container, helped by some `docker run`
   command [reverse engineering](https://gist.githubusercontent.com/efrecon/8ce9c75d518b6eb)
2. The Docker provisioner [source code](https://github.com/siderolabs/talos/blob/main/pkg/provision/providers/docker/create.go).

Here is the full command to spawn a second worker node manually:

```
docker run \
  --name talos-default-worker-2 \
  --hostname talos-default-worker-2 \
  --privileged \
  --security-opt seccomp=unconfined \
  --read-only \
  --cpus=2 \
  --memory=2048m \
  --mount type=tmpfs,destination=/run \
  --mount type=tmpfs,destination=/system \
  --mount type=tmpfs,destination=/tmp \
  --mount type=volume,destination=/var \
  --mount type=volume,destination=/system/state \
  --mount type=volume,destination=/etc/cni \
  --mount type=volume,destination=/etc/kubernetes \
  --mount type=volume,destination=/usr/libexec/kubernetes \
  --mount type=volume,destination=/opt \
  --network "talos-default" \
  --env "PLATFORM=container" \
  --env "TALOSSKU=2CPU-2048RAM" \
  --env "$(docker inspect -f '{{range $value := .Config.Env}}{{if eq (index (split $value "=") 0) "USERDATA" }}{{print $value}}{{end}}{{end}}' talos-default-worker-1)" \
  --label "talos.cluster.name"="talos-default" \
  --label "talos.owned"="true" \
  --label "talos.type"="worker" \
  --detach \
  "ghcr.io/siderolabs/talos:v1.6.6"
```

Granted, this deserves a couple of comments... Most of it is about setting the proper security (very privileged)
context and resources and should be pretty straight-forward. This is essentially designed to mimic a VM with
constrained CPU / RAM and full access to kernel APIs. Another interesting point is that the container is spawned
in a dedicated `talos-default` L2 network, isolated from the default Docker bridge. Last but not least (by far)
is the large `docker inspect` invocation. This sub-command grabs the base64-encoded "machineconfig.yaml" which
is passed to the container for initialization. This is very similar to typical "cloud-init" mechanism.

Among other things, this large `USERDATA` provides machine type (a worker), the cluster credentials, the
discovery configuration (more on this later) and the CNI setup configuration (more on this later - again).
On a real machine, it would also be the place for disk configuration and so on.

Fast-forward a few minutes, Kubernetes automatically picks our new node:

```
kubectl get nodes -o wide
NAME                           STATUS   ROLES           AGE   VERSION   INTERNAL-IP   EXTERNAL-IP   OS-IMAGE         KERNEL-VERSION     CONTAINER-RUNTIME
talos-default-controlplane-1   Ready    control-plane   32m   v1.29.2   10.5.0.2      <none>        Talos (v1.6.6)   6.5.0-21-generic   containerd://1.7.13
talos-default-worker-1         Ready    <none>          32m   v1.29.2   10.5.0.3      <none>        Talos (v1.6.6)   6.5.0-21-generic   containerd://1.7.13
talos-default-worker-2         Ready    <none>          12m   v1.29.2   10.5.0.4      <none>        Talos (v1.6.6)   6.5.0-21-generic   containerd://1.7.13
```

This manual scaling is very nice. It allowed to better understand the inner mechanism and is also much
closer to what a real cluster scaling would look like: Just spawning a machine with the proper "machineconfig".
Et voilà!

### Scaling down

Surely, scaling down is as simple as a `docker rm`. Lemme do this!

No wai...t. Too late 💥

A `docker rm -f talos-default-worker-2` later, and we are in troubles.

First, Kubernetes laconically reports the brutally deleted node (think: reclaimed spot instance)
as `NotReady`. This is easily dealt with a simple `kubectl delete node talos-default-worker-2`
since this was our intent anyway.

Second Talos discovery is 🥴 at best:

```
$> talosctl cluster show
ParseAddr(""): unable to parse IP
```

Indeed, the node is still reported in the discovery:

```
$> talosctl -n 10.5.0.2 get members
NODE       NAMESPACE   TYPE     ID                             VERSION   HOSTNAME                       MACHINE TYPE   OS               ADDRESSES
10.5.0.2   cluster     Member   talos-default-controlplane-1   2         talos-default-controlplane-1   controlplane   Talos (v1.6.6)   ["10.5.0.2"]
10.5.0.2   cluster     Member   talos-default-worker-1         1         talos-default-worker-1         worker         Talos (v1.6.6)   ["10.5.0.3"]
10.5.0.2   cluster     Member   talos-default-worker-2         1         talos-default-worker-2         worker         Talos (v1.6.6)   ["10.5.0.4"]

$> talosctl -n 10.5.0.2 get affiliates
NODE       NAMESPACE   TYPE        ID                                             VERSION   HOSTNAME                       MACHINE TYPE   ADDRESSES
10.5.0.2   cluster     Affiliate   5xvftx7VeTK10k1NhoJcQ5jOe381pgjBpw5BKhwGMuNA   2         talos-default-controlplane-1   controlplane   ["10.5.0.2"]
10.5.0.2   cluster     Affiliate   hIeB2t3164uoTAWCPEKbGAyh4xYNz5lKf3KV9jiQXDr    1         talos-default-worker-1         worker         ["10.5.0.3"]
10.5.0.2   cluster     Affiliate   pijNaG3obTZXoeR9QxGeJS7NF2MR5jge8gQe7SEnh0QB   1         talos-default-worker-2         worker         ["10.5.0.4"]
```

Members are accepted affiliates. Affiliates are discovered nodes that are not yet affected to a cluster.

And the "health" Talos command now hangs for a few minutes before reporting an error:

```
talosctl -n 10.5.0.2 health
discovered nodes: ["10.5.0.3" "10.5.0.4" "10.5.0.2"]
waiting for etcd to be healthy: ...
waiting for etcd to be healthy: OK
waiting for etcd members to be consistent across nodes: ...
waiting for etcd members to be consistent across nodes: OK
waiting for etcd members to be control plane nodes: ...
waiting for etcd members to be control plane nodes: OK
waiting for apid to be ready: ...
waiting for apid to be ready: rpc error: code = DeadlineExceeded desc = context deadline exceeded
waiting for apid to be ready: 1 error occurred:
    * 10.5.0.4: rpc error: code = Unavailable desc = connection error: desc = "transport: Error while dialing: dial tcp 10.5.0.4:50000: connect: no route to host"
healthcheck error: rpc error: code = DeadlineExceeded desc = context deadline exceeded
```

As a last resort, I decided to give a try to
[the documentation](https://www.talos.dev/v1.6/talos-guides/howto/scaling-down/)
(Yes, I should have started there...). But it was not significantly better and the health command
still hangs for minutes.

Unfortunately, the only workaround for this is by waiting for the discovery timeout to expire after 30 minutes.
I could not find any way to inform Talos that the node was indeed deleted. This is a bit puzzling because this is
the kind of scenario that I would expect to occur in production, were, for instance, an hypervisor suddenly
goes down or a top-of-rack switch gets "disconnected".

#### Moving to Cilium

As a last step for this lab, I wanted to check how easily Talos would accommodate a Cilium CNI in
place of the default / built-in Flannel. Cilium is a project I have been following since its inception
not because I had a use for it (not in autonomous vehicles, anyway) but because we share a common
interest and passion for eBPF. They also maintain a very good Go library to work with eBPF, which I did
use for gathering CAN bus metrics from the kernel (and also contributed a little to the project).

That being said, there is 1 feature in particular that I especially love with Cilium. This is their
out of the box support for filter egress traffic based on the FQDN. This is the only Kubernetes solution
I found so far which could do it easily in the OpenSource offer. Calico can do it, but only in the
commercial version and Istio should be able to do it, it is however pretty expensive to set up (requires
a dedicated egress gateway instance for each domain, if I understood correctly) and I was not able
to get it working.

This ability to filter egress traffic by domain name is essential in my opinion as part of cluster
hardening in a context where we run more and more off-the-shelf code (think of supply chain attacks)
and IP based filter no longer makes really sense in the Cloud era where IPs can change at any time
and any given IP can host thousands of domains. Applying egress domain filter is an extremely valuable
component of a defense in depth strategy by making it harder for malicious component to reach a command
and control, for instance.

Anyway, sure Cilium is great, how do we install it?

As opposed to the "scaling down" part above, I was wiser and started by
[reading the documentation](https://www.talos.dev/v1.6/kubernetes-guides/network/deploying-cilium/) 😅.

And because we are hype-driven (inside joke), we will even run Cilium in kube-proxy replacement
mode. Don't ask me for arguments here.

I first tried to migrate an existing Cluster and gave-up mid-way, but it should be possible. I stopped
after applying the new Talos configuration (which I'll detail right after) and noticing that the Flannel
and Kube-Proxy containers were still there. Again, probably nothing too important, but this time I was
more interested in getting it to work rather than the live path.

Anyway, the official instructions all assume that we are spawning a new cluster and this is the occasion
to dive into the cluster provisioning process. All considered, let's spawn a clean-sheet cluster with
Cilium as a CNI.

Interestingly, the recommended approach (templating the configuration and embedding it in machine
configuration) is the last of 4 alternative methods in the official documentation.

First, we need to prepare a "patch" for the machine configuration. Let's call it
`cilium-patch-all-nodes.yaml`:

```yaml
---
cluster:
  network:
    cni:
      name: none
  proxy:
    disabled: true
```

As a second step, we can now render the configuration for our Cilium installation. The only difference
with the official documentation here is the enablement of "Hubble", because I found it terribly useful
to troubleshoot policies, but that's beyond the scope of this (already too long) post:

```bash
helm repo add cilium https://helm.cilium.io/
helm template \
    cilium \
    cilium/cilium \
    --version $(curl -s https://raw.githubusercontent.com/cilium/cilium/main/stable.txt) \
    --namespace kube-system \
    --set ipam.mode=kubernetes \
    --set kubeProxyReplacement=true \
    --set hubble.relay.enabled=true \
    --set hubble.ui.enabled=true \
    --set securityContext.capabilities.ciliumAgent="{CHOWN,KILL,NET_ADMIN,NET_RAW,IPC_LOCK,SYS_ADMIN,SYS_RESOURCE,DAC_OVERRIDE,FOWNER,SETGID,SETUID}" \
    --set securityContext.capabilities.cleanCiliumState="{NET_ADMIN,SYS_ADMIN,SYS_RESOURCE}" \
    --set cgroup.autoMount.enabled=false \
    --set cgroup.hostRoot=/sys/fs/cgroup \
    --set k8sServiceHost=localhost \
    --set k8sServicePort=7445 > cilium-rendered-helm-manifest.yaml
```

As a third step, we will prepare a "patch" for the control nodes. This patch will register an inline
"cilium" manifest. Talos will then ensure this manifest is tied to the cluster lifecycle and
automatically applied on cluster initial boot. This means that, once the cluster is up, it is also
ready with no further bring-up steps. Here is the patch generation:

```bash
cat > cilium-patch-control-nodes.yaml <<EOF
cluster:
  inlineManifests:
    - name: cilium
      contents: |
$(sed  's/^/        /'  cilium-rendered-helm-manifest.yaml)
EOF
```

> **Note**: If you want to place Cilium in a dedicated namespace (which is a good idea anyway), you will
also need to insert the namespace creation manifest at the beginning AND make sure to add the following
label on it: `pod-security.kubernetes.io/enforce=privileged`, otherwise the namespace will be in
`baseline` mode and will lack the proper privileges. See the
[documentation for more info](https://www.talos.dev/v1.6/kubernetes-guides/configuration/pod-security/#usage).

Finally, we can boot the cluster, again, as fleet of Docker containers. And since I'm getting too lazy to
find the proper configuration flag for single-control/worker-node cluster, let's see big with 3 nodes of
each (which takes ages to boot):

```bash
talosctl cluster create \
    --controlplanes 3 \
    --workers 3 \
    --config-patch @cilium-patch-all-nodes.yaml \
    --config-patch-control-plane @cilium-patch-control-nodes.yaml
```

This command instructs Talos to apply the 2 patches we generated earlier on top of the default configuration.
This is a convenient way to overload parameters without needing to specify each default parameter manually.

> **Note**: For a real production cluster, the logic is the same, except that you would be using
`talosctl gen config` instead to generate the configuration files, with the same patches.

7 minutes and 48 seconds later, we can now use Cilium's CLI to check the status and 🥳:

```
$> cilium status
    /¯¯\
 /¯¯\__/¯¯\    Cilium:             OK
 \__/¯¯\__/    Operator:           OK
 /¯¯\__/¯¯\    Envoy DaemonSet:    disabled (using embedded mode)
 \__/¯¯\__/    Hubble Relay:       OK
    \__/       ClusterMesh:        disabled

Deployment             hubble-relay       Desired: 1, Ready: 1/1, Available: 1/1
Deployment             hubble-ui          Desired: 1, Ready: 1/1, Available: 1/1
Deployment             cilium-operator    Desired: 2, Ready: 2/2, Available: 2/2
DaemonSet              cilium             Desired: 6, Ready: 6/6, Available: 6/6
Containers:            cilium             Running: 6
                       hubble-relay       Running: 1
                       hubble-ui          Running: 1
                       cilium-operator    Running: 2
Cluster Pods:          4/4 managed by Cilium
Helm chart version:    
Image versions         cilium-operator    quay.io/cilium/operator-generic:v1.15.1@sha256:819c7281f5a4f25ee1ce2ec4c76b6fbc69a660c68b7825e9580b1813833fa743: 2
                       cilium             quay.io/cilium/cilium:v1.15.1@sha256:351d6685dc6f6ffbcd5451043167cfa8842c6decf80d8c8e426a417c73fb56d4: 6
                       hubble-relay       quay.io/cilium/hubble-relay:v1.15.1@sha256:3254aaf85064bc1567e8ce01ad634b6dd269e91858c83be99e47e685d4bb8012: 1
                       hubble-ui          quay.io/cilium/hubble-ui:v0.13.0@sha256:7d663dc16538dd6e29061abd1047013a645e6e69c115e008bee9ea9fef9a6666: 1
                       hubble-ui          quay.io/cilium/hubble-ui-backend:v0.13.0@sha256:1e7657d997c5a48253bb8dc91ecee75b63018d16ff5e5797e5af367336bc8803: 1
```

If you want to run some connectivity tests, I highly recommend using https://github.com/nicolaka/netshoot.
It works out of box, although the Pod Security Admission controller emits a 'restricted-level' warning.

### Conclusion

Talos Linux is powerful, flexible and well designed OS for Kubernetes. It successfully wraps common Kubernetes
management tasks while remaining relatively simple. If you are considering starting a new Kubernetes cluster
and managed offers do not match your needs, I strongly recommend evaluating Talos.

Going further, I'd love to evaluate the Kata-Containers and disk encryption features, but time to move on.

**By the way**: I'm available for hire, full-remote or based in Toulouse area (France) 😇. If you have an open SRE position, feel free to contact me: `jt [AT] yadutaf [DOT] fr`.
