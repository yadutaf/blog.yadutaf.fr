---
title: Google HTTPS SEO (Nginx)
author: Jean-Tiare Le Bigot
layout: post
date: 2012-09-07
url: /2012/09/07/google-https-seo-nginx/
categories:
  - Dev-Web
  - Sysadmin
tags:
  - google
  - https
  - nginx
  - seo
---
A couple of days ago, well, 5 to be precise, I moved this blog to a new server, new Nginx based stack. In the move, I decided to enforce secured HTTPS force all my services, including this blog. Privacy matters!

Surprisingly enough, I suddenly disappeared from Google at the very same time.<!--more-->

It appears to be linked to the HTTPS move. Disabling the systematic redirection to the secured protocol made it happy again.

However, I still want to be automatically moved to the secure version every time I log into the backend. All WordPress admin pages starts with &#8216;/wp-&#8216;, it is then straight forward to make Nginx clever about security. Here is a nice snippet to put into the relevant &#8216;server' section:

<pre class="brush: cpp; title: ; notranslate" title="">location /wp-
    {
      if ($ssl_protocol = "")
      {
          rewrite ^   https://$server_name$request_uri? permanent;
      }
    }
</pre>

instead of only

<pre class="brush: cpp; title: ; notranslate" title="">if ($ssl_protocol = "")
    {
        rewrite ^   https://$server_name$request_uri? permanent;
    }
</pre>