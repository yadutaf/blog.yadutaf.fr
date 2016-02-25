---
title: Security as a commercial strategy
author: Jean-Tiare Le Bigot
layout: post
date: 2016-02-26
url: /2016/02/26/security-as-a-commercial-strategy/
categories:
  - Strategy
tags:
  - essay
  - cloudflare
  - strategy
  - security
---

This post is an essay. I am not a business expert. I am not working for Cloudflare. Actually, I'm working for a [competitor][0]. This is an attempt to understand Cloudflare's strategy, based on my own (rather short) experience.

2 days ago, Cloudflare [announced][1] they created a new Registrar, but not one like all the quadrillions other registrars. A registrar for security concerned companies. Just in case, a [registrar][2] is the guy who lends you a domain name.

Long story short, their reasoning is pretty straight-forward:

1. domain names are critical to an organization
2. most registrar authenticate organization as any individual
3. people knowing the authentication secret eventually leave
4. people knowing the authentication secret eventually *might* be abused
5. in turn, domain names *might* eventually be abused

So they told themselves, why not fixing this, like they did for content distribution?

But here is the catch: unlike content distribution which requires a pretty big initial investment, anybody can bootstrap a registrar with only a handful of cheap servers from any cloud provider. The costs stay low. If you have no customer, you pay close to nothing. You can even bootstrap your activity [as a reseller][3] for a couple of bucks. This is cheap, this is easy. The landscape is [crowded][4].

So, you want to be a registrar? Great. How different are you?

With this in mind, CloudFlare's move is a clever one. By focusing on security, they bootstrap their registrar activity with a limited number of high level, technically skilled, big paying customers with easy to implement things on their side (ACLs). All this while capitalizing on their existing image. Remember, the AntiDDos thing.

Then, in a second time, they'll most probably generalize (if not yet done) this security to all accounts and services AND most probably open their registrar offers to any one. And maybe even offer free domains with a custom [gTLD][5].

One step at a time.

More generally, their strategy to attract bigger customers seems to be security. The most obvious way is their [L7 attack mitigation][6]. On the same trend, they developed a way to offer SSL termination on their side without giving them the secret key (basically, [a patch in OpenSSL][7] to implement the Oracle pattern). They did this to target banks (in this case, a BitCoin exchange) by offering them scalability without compromising on the security. Again, security.

Should security be your main concern for your business? No idea. Seriously, I don't know it, you do. It *is* important, for sure. What I can tell you is CloudFlare was clever. They turned what most see as a constraint not only as a commercial argument but as the core of their commercial strategy. A constraint turned into a strength.

What is your future strength?

 [0]: https://www.ovh.com/
 [1]: https://blog.cloudflare.com/introducing-cloudflare-registrar/
 [2]: https://en.wikipedia.org/wiki/Domain_name_registrar
 [3]: https://partners.ovh.com/
 [4]: https://www.icann.org/registrar-reports/accredited-list.html
 [5]: https://en.wikipedia.org/wiki/Generic_top-level_domain
 [6]: https://www.cloudflare.com/ddos/
 [7]: https://blog.cloudflare.com/keyless-ssl-the-nitty-gritty-technical-details/

