---
title: Node.Js reverse proxy
author: Jean-Tiare Le Bigot
layout: post
date: 2011-09-19
url: /2011/09/19/nodejs-reverse-proxy/
categories:
  - Dev-Web
  - Sysadmin
tags:
  - Node.js
  - OVH
  - reverse-proxy
  - VHost
---
When I rented this OVH server, I wanted to be able to host all my web tools on it on port 80 using both my IPv6 and IPv4 stack. This is usually done with Apache's &#8220;ports.conf&#8221; and VHost feature.

In fact, most of my favorite applications are written using [Node.Js][1] and as such embeds there own server logic. It is not possible anymore to bind each of them to *:80.

The only solution is then to use a reverse-proxy binded to all my real interfaces on port 80 and to forward calls based on the domain to the real applications listening to a random port of the loopback interface.

I found an impressive 20 line basis on [Peteris Krumins' blog][2] that I forked on Github. You can find [my modifications on my github fork][3].

The basic idea is to decode the &#8220;host&#8221; field of the HTTP 1.1 headers and to forward the requests according to the config file. This solves the &#8220;VHost&#8221; issue. Here are two helpers I use internally:

<pre class="brush: jscript; title: ; notranslate" title="">//decode host and port info from header
function decode_host(host){
    out={};
    host = host.split(':');
    out.host = host[0];
    out.port = host[1] || 80;
    return out;
}

//Find the more precise rule for this request.
//the actual rule decoding in done in "handle_proxy_rule"
//which i did not include in this snippet to keep it short 😉
function handle_proxy_route(host, token) {
    //extract target host and port
    action = decode_host(host);
    action.action="proxyto";//default action

    //try to find a matching rule
    //rule of the form "foo.domain.tld:port"
    if(action.host+':'+action.port in hostfilters)
    {
         rule=hostfilters[action.host+':'+action.port];
         action=handle_proxy_rule(rule, action, token);
    }
    //rule of the form "foo.domain.tld"
    else if (action.host in hostfilters)
    {
         rule=hostfilters[action.host];
         action=handle_proxy_rule(rule, action, token);
    }
    //rule of the form "*:port"
    else if ("*:"+action.port in hostfilters)
    {
         rule=hostfilters['*:'+action.port];
         action=handle_proxy_rule(rule, action, token);
    }
    //default rule
    else if ("*" in hostfilters)
    {
         rule=hostfilters['*'];
         action=handle_proxy_rule(rule, action, token);
    }
    return action;
}
</pre>

It is then possible to put all this server logic in a separate callback that would be called by multiple listener. This solves the &#8220;Dual stack&#8221; issue.

<pre class="brush: jscript; title: ; notranslate" title="">interface_to_listen_on = [
    {'ip':"0.0.0.0", 'port':80},//all IPv4 int
    {'ip':"::", 'port':80}//all IPv6 int
];

interface_to_listen_on.forEach(function(listen)
{
    port = listen.port;
    ip=listen.ip;
    sys.log("Starting server on port '" + ip+':'+port);
    http.createServer(server_loop).listen(port, ip);
});</pre>

What if a malicious packet is forged that makes every thing crash ? Let's add a small security layer. At least filtering based on source address was already done by the bootstrap code. I just added a &#8220;last chance exception catcher&#8221; and an input field check. Here is he last chance exception catcher. The filtering is pretty straight forward. It mostly is a matter of checking headers on by one and taking a decision.

<pre class="brush: jscript; title: ; notranslate" title="">//last chance error handler
//it catch the exception preventing the application from crashing.
//I recommend to comment it in a development environment as it
//"Hides" very interesting bits of debugging informations.
process.on('uncaughtException', function (err) {
  console.log('LAST ERROR: Caught exception: ' + err);
});
</pre>

What if a redirect rule has an error that causes a loop ? Let's add a special header indicating that a forward already happened. That's all the trick.

<pre class="brush: jscript; title: ; notranslate" title="">function prevent_loop(request, response)
{
    //if request is already tooted =&gt; loop 
    if(request.headers.proxy=="node.jtlebi")
    {
        sys.log("Loop detected");
        response.writeHead(500);
        response.write("Proxy loop !");
        response.end();
        return false;
    } 
    //append a tattoo to it
    else 
    {
        request.headers.proxy="node.jtlebi";
        return request;
    }
}</pre>

What if I need authentication for an app that doesn't support it natively ? Let's implement &#8220;basic auth&#8221; as defined in RFC 2617. It is really easy to do:

<pre class="brush: jscript; title: ; notranslate" title="">//1st =&gt; On each request, decode the "authorization" field (easy part)
function authenticate(request)
{
    token={
            "login":"anonymous",
            "pass":""
        };
    if (request.headers.authorization && request.headers.authorization.search('Basic ') === 0) 
    {
        // fetch login and password
        basic = (new Buffer(request.headers.authorization.split(' ')[1], 'base64').toString());
        sys.log("Authentication token received: "+basic);
        basic = basic.split(':');
        token.login = basic[0];
        token.pass  = basic[1];//fixme: potential trouble if there is a ":" in the pass
    }
    return token;
}

//2nd =&gt; Somewhere in your application logic, check credentials
//3rd =&gt; If they are not valid, issue an authentication request (trivial part :p )
function action_authenticate(response, msg)
{
    response.writeHead(401,{
        'WWW-Authenticate': "Basic realm=\""+msg+"\""
    });
    response.end();
}
</pre>

To make it short, this reverse-proxy enables :

  * IPv4/IPv6 only application to answer to both IP familly
  * Independent servers to work transparently on the same public interface/port
  * Unsecured application to get very basic user security
  * more to come ? Let me know&#8230;

 [1]: http://nodejs.org/
 [2]: http://www.catonmat.net/http-proxy-in-nodejs/
 [3]: https://github.com/jtlebi/nodejs-proxy