---
title: About proxying wget http 1.0 using http 1.1 headers
author: Jean-Tiare Le Bigot
layout: post
date: 2011-09-21
url: /2011/09/21/about-proxying-wget-http-1-0-using-http-1-1-headers/
categories:
  - Sysadmin
tags:
  - HTTP
  - Node.js
  - Wget
---
When [a friend][1] tried to syndicate my blog on his, his server was unable to complete the sync. Page http://blog.jtlebi.fr/feed/ simply timed out. After quite a few tests, we noticed that this issue never happened with a browser like Firefox. Aside,  Wget hanged for 2 minutes after downloading more than Firefox. Strange

In my previous post, I explained that WordPress is hosted behind Apache2, Apache2 behind itself reachable behind [my house-made reverse-proxy][2]. The main goal being to host all services on port 80.

<pre>|&lt;-----&gt; Apache (WordPress and more)
Client &lt;----&gt; Reverse-Proxy |&lt;-----&gt; Etherpad
                            |&lt;-----&gt; Cloud 9
                            |...</pre>

Using tcpdump, we noticed that the packet with the &#8220;FIN&#8221; flag set was never send by the client. The strangest was that Wget received more data than Firefox.

<!--more-->

After a few hours of investigations, it appeared that Wget was sending header &#8220;keepalive&#8221; to keep the connection open while using http version 1.0. &#8220;Keepalive&#8221; is an illegal header in HTTP 1.0 as it has been introduced with 1.1 revision. This is actually a [known bug][3]. A workaround is to use it in conjunction with &#8220;-no-http-keep-alive&#8221; command-line option.

<div id="attachment_48" style="width: 310px" class="wp-caption aligncenter">
  <a href="http://blog.jtlebi.fr/wp-content/uploads/2011/09/wireshark-wget-http-violation.png"><img class="size-medium wp-image-48" title="wireshark: wget http violation" src="http://blog.jtlebi.fr/wp-content/uploads/2011/09/wireshark-wget-http-violation-300x168.png" alt="Wireshark shows that wget uses illegal header &quot;keepalive&quot; with HTTP version 1.0" width="300" height="168" /></a>
  
  <p class="wp-caption-text">
    Wireshark shows that wget uses illegal header &#8220;keepalive&#8221; with HTTP version 1.0
  </p>
</div>

The real reason why Wget avoid using version 1.1 is that it doesn't understand &#8220;Transfer-Encoding: chunked&#8221; header, which is shame, btw. Since the answer was encoded this way, it embedded chunk size informations interpreted as regular content by Wget making the resulting file both bigger and corrupted.

Since I can not force all my visitors willing to wget from my website to use this workaround, I had to &#8220;hardcode&#8221; a way to force HTTP/1.0 when proxying for 1.0 enabled client. According to &#8220;http&#8221; module documentation of node.js, it automatically adapts itself when responding to request protocol. This is great. Since my reverse proxy implementation just streams raw answers back to the client, I needed a way to forward the request in the same version to get a compatible answer. Sadly this is not (yet) possible.

I suggested [a fix on github wich is currently under review][4] by node.js team on master and v0.4 branches to address this missing feature. Wait and see <img src="https://blog.jtlebi.fr/wp-includes/images/smilies/simple-smile.png" alt=":)" class="wp-smiley" style="height: 1em; max-height: 1em;" />

UPDATE 25/09/2011:
  
Here is a copy a [comment i posted on github][5] which sums well up the situation:

> <div>
>   <p>
>     Actually, the &#8220;end&#8221; event seems to be fired when the data stream ends. It is not linked to the underlying socket. Eherpad (like most software) relies on the ability the HTTP1.1 to &#8220;keepalive&#8221; a connection. This is the behaviour broken by the &#8220;destroy&#8221; called on &#8220;end&#8221; event.
>   </p>
>   
>   <p>
>     The actual bug I was facing was hidden deeply inside. It occured only when prowying HTTP/1.0 requests. To make things even more complicated, Wget is cheating and uses HTTP/1.1 &#8220;keepalive&#8221; header. I tried to clarify all this in this blogpost: <a href="../2011/09/21/about-proxying-wget-http-1-0-using-http-1-1-headers/">http://blog.jtlebi.fr/2011/09/21/about-proxying-wget-http-1-0-using-http-1-1-headers/</a>
>   </p>
>   
>   <p>
>     Currently, i rely on a patch i did to add HTTP/1.0 to node.js http lib to fix this. My pull request will probably never be merged in as this truly is &#8220;legacy feature&#8221; <img src="https://blog.jtlebi.fr/wp-includes/images/smilies/simple-smile.png" alt=":)" class="wp-smiley" style="height: 1em; max-height: 1em;" /> The best would be to fix Wget 😀
>   </p>
>   
>   <p>
>     If a need appears to bring a real long term fix, I can either embed a patched version of the http library or implement a real proxy HTTP/1.0 <&#8212;-> HTTP/1.1, the biggest concern being the &#8220;transfer-encoding: chunked&#8221; which is almost always used by Apache2 but not available in HTTP/1.0 and thus requires the full filesize to be known when starting the transfer and caching to be enabled on the proxy side as soon as this transfer encoding is used.
>   </p>
>   
>   <p>
>     Let me know if a better fix would be a good idea.
>   </p>
> </div>

 [1]: http://www.grapsus.net/
 [2]: https://github.com/jtlebi/nodejs-proxy
 [3]: https://www.varnish-cache.org/trac/ticket/524
 [4]: https://github.com/joyent/node/pull/1750
 [5]: https://github.com/pkrumins/nodejs-proxy/pull/11#issuecomment-2190685