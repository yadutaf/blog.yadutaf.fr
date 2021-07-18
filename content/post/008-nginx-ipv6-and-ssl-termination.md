---
title: 'Nginx: IPv6 and SSL termination'
author: Jean-Tiare Le Bigot
layout: post
date: 2012-09-02
url: /2012/09/02/nginx-ipv6-and-ssl-termination/
categories:
  - Sysadmin
tags:
  - https
  - IPv6
  - nginx
  - ssl
---
I just installed the beautiful NGINX reverse proxy on my personal server. I use it to run various personal web-based services like this blog, Etherpad or Gitlab. That's 3 different programming languages, PHP, JS, Ruby. Wow.

Sadly, none of them handles natively HTTPS nor IPv6 moreover, they all require a standalone port to run on. Hopefully, reverse proxies are here to solve the problem. And I chose NGINX. I was previously using a home grown one which is much, much easier to configure but not really state of the art. So Bye Bye <img src="https://blog.jtlebi.fr/wp-includes/images/smilies/simple-smile.png" alt=":)" class="wp-smiley" style="height: 1em; max-height: 1em;" />

I want to to enforce HTTPS connections and allow both IPv4 and IPv6.<!--more-->

Add this to the top of each &#8220;server&#8221; block:

<pre class="brush: bash; title: ; notranslate" title="">listen   80;
listen   [::]:80;
listen   443 ssl;
listen   [::]:443 ssl;
</pre>

Add this right after the previous or directly in the &#8220;http&#8221; block if &#8220;nginx.conf&#8221; if you have wildcard certificate:

<pre class="brush: bash; title: ; notranslate" title="">ssl_certificate /etc/ssl/private/ssl-full-chain.crt;
ssl_certificate_key /etc/ssl/private/ssl-main.key;
</pre>

Note that Nginx expects the whole certificate chain to be in the .crt or .pem file that is you actual certificate followed by the whole certification chain up to the root CA at the end.

The last step is now to &#8220;force&#8221; HTTPS. The idea is to read an ssl variable. If unset, redirect to the HTTPS version of the page:

<pre class="brush: bash; title: ; notranslate" title="">if ($ssl_protocol = "") {
    rewrite ^   https://$server_name$request_uri? permanent;
}
</pre>

If Nginx complains with &#8220;nginx: [emerg] bind() to [::]:443 failed (98: Address already in use)&#8221;, try appending &#8220;ipv6only=on&#8221; to the the faulty config line.

Try on this blog, it should only be accessible with HTTPS <img src="https://blog.jtlebi.fr/wp-includes/images/smilies/simple-smile.png" alt=":)" class="wp-smiley" style="height: 1em; max-height: 1em;" />