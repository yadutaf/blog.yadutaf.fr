---
title: How to run Docker behind an Nginx reverse proxy
author: Jean-Tiare Le Bigot
layout: post
date: 2014-12-12
url: /2014/12/12/how-to-run-docker-behind-an-nginx-reverse-proxy/
categories:
  - Docker
tags:
  - docker
  - nginx
  - patch
---
A couple of weeks ago, I wanted to run some experiment to see how Docker could run in a cloud / shared hosting like environment. In the mean time, Docker released version 1.4 bringing additional security/authentication and Docker machine to automate the process of creating and running a remote Docker instance.

Shared hosting farms are usually built around some kind of public gateway for incoming/outgoing traffic as well as management traffic including FTP and SSH. Te largest part of the farm - not unlike an iceberg - being &#8220;hidden&#8221; in a private network behind these gateways.

So, my question was, is there any way we can imagine that could enable a similar gateway behavior with Docker, including multi-tenancy support and all features you'd expect?

It turns out, there is.
  
<!--more-->

Docker binary can actually play up to 3 roles:

  * Docker Command line -> the one making it shiny and plain awesome
  * Docker Daemon -> the one behind the scenes doing most of the hard work
  * Docker init -> the one behind the one behind the scenes doing the early container setup

The command line and and daemon talk together using a _**mostly**_ HTTP based protocol. I say &#8220;mostly&#8221; because the a couple of API endpoints &#8216;hijack' the connection, notably the `container/attach` endpoint, also known as &#8220;forward my container's console.&#8221;

Knowing that, a common setup, already well covered by blog posts around the web, recommend to setup an `NGinx` reverse proxy and add basic authentication for the security.

Sadly, there are 2 downsides with this approach:

  * Stock Docker client does not &#8220;speak&#8221; HTTP basic authentication
  * Stock Nginx is completely lost when Docker hijacks the connection

Regarding the authentication issue, I recommend to rather rely on Docker TLS certificate as they are supported out of the box. Then, using some LUA magic, we could use them as &#8220;public keys&#8221; to balance to the appropriate. This would in itself a good subject for a dedicated post.

How do we deal with the second point, namely, Nginx being lost?

Once the mechanism behind the &#8220;hijack&#8221; is well identified, things quickly becomes straight forward: A usual HTTP connection could be seen as &#8220;half-duplex&#8221; network. One peer talks and, when it is done, the other peer can talk and so on, using a well known protocol. When doing a docker attach, Docker uses the raw TCP connection in &#8220;full duplex&#8221; mode, any peer can talk whenever they have something to say. This is why reverse proxies are lost: they expect - and rely - a lot on the HTTP protocol being well respected.

Interestingly, there is another mainstream protocol doing just this. As it turns out, this standard protocol is so popular that it has been integrated in Nginx years ago. I named `WebSocket`.

So, basically, the idea is to teach Nginx how to handle Docker's custom protocol just as it does with websockets. Here is the patch:

<pre class="brush: plain; title: ; notranslate" title="">--- a/src/http/ngx_http_upstream.c	Tue Nov 04 19:56:23 2014 +0900
+++ b/src/http/ngx_http_upstream.c	Sat Nov 15 16:21:58 2014 +0100
@@ -89,6 +89,8 @@
     ngx_table_elt_t *h, ngx_uint_t offset);
 static ngx_int_t ngx_http_upstream_process_content_length(ngx_http_request_t *r,
     ngx_table_elt_t *h, ngx_uint_t offset);
+static ngx_int_t ngx_http_upstream_process_content_type(ngx_http_request_t *r,
+    ngx_table_elt_t *h, ngx_uint_t offset);
 static ngx_int_t ngx_http_upstream_process_last_modified(ngx_http_request_t *r,
     ngx_table_elt_t *h, ngx_uint_t offset);
 static ngx_int_t ngx_http_upstream_process_set_cookie(ngx_http_request_t *r,
@@ -175,7 +177,7 @@
                  ngx_http_upstream_copy_header_line, 0, 0 },

     { ngx_string("Content-Type"),
-                 ngx_http_upstream_process_header_line,
+                 ngx_http_upstream_process_content_type,
                  offsetof(ngx_http_upstream_headers_in_t, content_type),
                  ngx_http_upstream_copy_content_type, 0, 1 },

@@ -2716,6 +2718,7 @@
     u-&gt;write_event_handler = ngx_http_upstream_upgraded_write_upstream;
     r-&gt;read_event_handler = ngx_http_upstream_upgraded_read_downstream;
     r-&gt;write_event_handler = ngx_http_upstream_upgraded_write_downstream;
+    u-&gt;headers_in.chunked = 0;

     if (clcf-&gt;tcp_nodelay) {
         tcp_nodelay = 1;
@@ -3849,6 +3852,25 @@

 static ngx_int_t
+ngx_http_upstream_process_content_type(ngx_http_request_t *r, ngx_table_elt_t *h,
+    ngx_uint_t offset)
+{
+    ngx_int_t ret = ngx_http_upstream_process_header_line(r, h, offset);
+    if (ret != NGX_OK) {
+        return ret;
+    }
+
+    // is docker header ?
+    if (ngx_strstrn(h-&gt;value.data,
+                    "application/vnd.docker.raw-stream", 34 - 1) != NULL) {
+        r-&gt;upstream-&gt;upgrade = 1;
+    }
+
+    return NGX_OK;
+}
+
+
+static ngx_int_t
 ngx_http_upstream_process_last_modified(ngx_http_request_t *r,
     ngx_table_elt_t *h, ngx_uint_t offset)
 {
1

The only remaining step is then to configure the reverse proxy, as usual. This should be easy 😉

Just for the record, here is my test &lt;code&gt;nginx.conf&lt;/code&gt;:

1
worker_processes  1;

events {
    worker_connections  1024;
}

http {
    include       mime.types;
    default_type  application/octet-stream;

    sendfile        on;

    keepalive_timeout  65;

    server {
        listen 9000;

        location / {
            proxy_buffering off;
            proxy_pass http://localhost:8080;
        }
    }
}
</pre>

You just need to run Docker on port 8080 with a command like the following or just add your params to `/etc/default/docker`

<pre class="brush: plain; title: ; notranslate" title="">docker -d -H tcp://localhost:8080</pre>

And we're done!

### Final thought

While hacking this, I noticed that all Nginx needs to switch protocols for websockets was proper HTTP Headers:

<pre class="brush: plain; title: ; notranslate" title=""># Request
Connection: Upgrade
Upgrade: websocket

# Response
HTTP/1.1 101 Upgraded
Connection: Upgrade
Upgrade: websocket
</pre>

So that another approach could be to inject proper headers in Docker protocol.