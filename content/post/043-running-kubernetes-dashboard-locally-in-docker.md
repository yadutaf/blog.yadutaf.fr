---
title: "Running Kubernetes dashboard locally — using Docker compose"
author: Jean-Tiare Le Bigot
layout: post
date: 2024-03-19
url: /2024/03/19/running-kubernetes-dashboard-locally-in-docker/
categories:
  - Sysadmin
tags:
  - kubernetes
  - dashboard
  - docker
---

One thing I love with ArgoCD design is the ability to run its UI out of the production cluster. In this mode,
only the 'core' (ie. the controllers) is running in the cluster, all access control is delegated to
Kubernetes itself and... that's all. On the (human) operator side, `argocd admin dashboard` is all it
takes to get a local instance of the dashboard to run locally, on demand.

I was looking for a way to apply a similar design with Kubernetes dashboard with respect to the API server.
However, this only related topic I found was a [similar question](https://discuss.kubernetes.io/t/is-it-possible-to-run-dashboard-ui-locally-via-docker-run-but-using-api-proxied-from-remote-server/26944?u=yadutaf)
on Kubernetes forum.

### Why does it matter?

I can see at least 3 reasons why running UI component out of the production cluster is actually a good practice:

* **`Architecture`**: First and foremost, separating the UI from the core encourages a clean separation and clean
  interface between 2 different layers of the system with different stakeholders, different lifecycles and different 
  availability targets. Indeed, this is an application of the "Clean Architecture" principles.
* **`Attack surface`**: The best way to reduce the attack surface is to NOT ship code in the first place. Code has
  two valuable things for an attacker: credentials and... bugs. And the Kubernetes dashboard is not immune to either.
  For instance, the metrics-scrapper component requires full read access to the pods and nodes definitions,
  while read-only, if compromised, this allows for full service discovery and further vulnerabilities discovery.
  Similarly, on the "bug" front, the dashboard was affected by CVE-2018-18264 a few years ago. Code comes with bugs.
  One of the best way to avoid the consequences is to avoid shipping code in production in the first place.
* **`Resource usage`**: The Kubernetes dashboard can use from a couple 100s of MB of RAM to a few GB. This is
  far from negligible on small clusters like development clusters and can start to contribute to the cluster cost.

Of course, all of what precedes should be balanced with the actual needs and risks. While it should generally
apply to production systems, especially the security aspects, I would probably argue in favor of deploying all
UIs that may be of help in development clusters as part of the platform's engineers mission to support the dev
teams, as long as the clusters are not exposed publicly.

### How do we run the Kubernetes dashboard *out* of the cluster?

#### Starting with a PoC

When one wants to run something locally, the (development guide)[https://github.com/kubernetes/dashboard/blob/master/DEVELOPMENT.md]
is often a good starting point. In our case, the guide presents 3 ways of running the dashboard locally among which the `make run` is the closest to our goal.

What `make run` does is:

1. Spawn a local `kind` cluster with a metric server
2. Build the images from source and run them in Docker, all of this using `docker compose`

> **Warning** If you decide to give `make serve` or `make run` locally, it consumes a HUGE amount
> of memory. On my machine, it suddenly allocated 8GB so that I had to forcibly reboot to recover.

This all looks pretty close to what we need. We can then get rid of the `kind` cluster step by
invoking `docker compose` manually, instead of using the Makefile wrapper. This looks like:

```
SYSTEM_BANNER="Hello admin\!" \
SYSTEM_BANNER_SEVERITY=INFO  \
WEB_BUILDER_ARCH=amd64 \
VERSION=0.0.0 \
SIDECAR_HOST=http://scraper:8000 \
KUBECONFIG=$HOME/.kube/config \
docker compose -f hack/docker/docker.compose.yaml --project-name=dashboard up \
    --build \
    --remove-orphans \
    --no-attach gateway \
    --no-attach scraper \
    --no-attach metrics-server
```

With this in place, the job is essentially done. The UI is running locally, in the set of Docker
containers, and is connected to whichever context is active in `$HOME/.kube/config`.

#### And cleaning it up

While it works, there is a bit of room for improvement:

1. A lot of environment variables still needs to be passed
2. Images are built from source, from the checked out commit, rather than using released artifacts
3. The compose definition expects a routed `kind` Docker network
4. The banner is annoying but mandatory
5. The compose file relies on at least one external file, `kong.yml`

After moving to images from the Docker Hub, removing the reliance on the 'kind' network, removing the
banner arguments, making use of sane defaults for variables that still made sense (eg: the VERSION and
KUBECONFIG) and inlining `kong.yml` using a very new feature of Docker compose, the result can be seen
in this Gist: https://gist.github.com/yadutaf/dcbf8668a102438e7b1ec3ff520d0cb6

And the following 1-liner can be used to launch the dashboard locally, using the credential in the
local kube config file:

```
curl -s https://gist.githubusercontent.com/yadutaf/dcbf8668a102438e7b1ec3ff520d0cb6/raw/802e339518f0fc1458fb0302624eb7ae3c8e184e/kube-dashboard.docker.compose.yaml \
   | docker compose -f- up \
     --remove-orphans \
     --no-attach gateway \
     --no-attach scraper
```

Much better, isn't it ?

#### Ah, but I'm missing my cloud-provider's auth plugin 😕

Out of curiosity, after testing with a local Talos cluster (see previous post ^^), I tried it with
a GKE cluster and was greeted with an error:

```
dashboard-api   | F0319 13:02:23.017359       1 main.go:133] Error while initializing connection to Kubernetes apiserver. This most likely means that the cluster is misconfigured (e.g., it has invalid apiserver certificates or service account's configuration) or the --apiserver-host param points to a server that does not exist. Reason: Get "https://34.23.38.178/version": getting credentials: exec: executable gke-gcloud-auth-plugin not found
dashboard-api   | 
dashboard-api   | It looks like you are trying to use a client-go credential plugin that is not installed.
dashboard-api   | 
dashboard-api   | To learn more about this feature, consult the documentation available at:
dashboard-api   |       https://kubernetes.io/docs/reference/access-authn-authz/authentication/#client-go-credential-plugins
dashboard-api   | 
dashboard-api   | Install gke-gcloud-auth-plugin for use with kubectl by following https://cloud.google.com/kubernetes-engine/docs/how-to/cluster-access-for-kubectl#install_plugin
dashboard-api   | Refer to our FAQ and wiki pages for more information: https://github.com/kubernetes/dashboard/wiki/FAQ
dashboard-api exited with code 255
```

A possible way around could be to inject it as a volume in the containers, to avoid a rebuild. There is another
interesting solution. We could make use of `kubectl proxy` to handle authentication on the host and then expose
a direct access to the API like this:

```
# Start the proxy, allowing connections from Docker's bridge
kubectl proxy --address 172.17.0.1 --accept-hosts='^localhost$,^127\.0\.0\.1$,^172\.\d+\.\d+\.\d$'

# Create a stub kubeconfig to connect through this proxy
cat > kubeconfig.proxy <<EOF
apiVersion: v1
kind: Config
clusters:
- cluster:
    server: http://172.17.0.1:8001
  name: proxy
contexts:
- context:
    cluster: proxy
    namespace: default
  name: proxy-default
current-context: proxy-default
EOF

# And finally start the dashboard using this config file
curl -s https://gist.githubusercontent.com/yadutaf/dcbf8668a102438e7b1ec3ff520d0cb6/raw/802e339518f0fc1458fb0302624eb7ae3c8e184e/kube-dashboard.docker.compose.yaml \
   | KUBECONFIG=kubeconfig.proxy docker compose -f- up \
     --remove-orphans \
     --no-attach gateway \
     --no-attach scraper
```

This time, the full chain is in place. As a bonus, with the de-coupling introduced by `kubectl proxy`,
this solution now works anywhere the proxy works, without modifications to the dashboard applications.

### Conclusion

While it is not directly/officially supported by the Kubernetes dashboard developers, it *is* possible
to run the dashboard locally, using Docker compose. Granted, this is not as lean as `argocd admin`,
but this is not too complicated either, using Gist.

Moreover, I strongly believe that tooling such as troubleshooting UIs are extremely powerful and valuable
HOWEVER, whenever possible, they should not be hosted in the production clusters, for architecture,
security and resource reasons.

**By the way**: I'm available for hire, full-remote or based in Toulouse area (France) 😇. If you have an
open SRE or system developer position, feel free to contact me: `jt [AT] yadutaf [DOT] fr`.
