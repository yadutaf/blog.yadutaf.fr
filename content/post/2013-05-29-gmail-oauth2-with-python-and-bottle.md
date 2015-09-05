---
title: Gmail Oauth2 with Python and bottle
author: Jean-Tiare Le Bigot
layout: post
date: 2013-05-29
url: /2013/05/29/gmail-oauth2-with-python-and-bottle/
categories:
  - Dev-Web
tags:
  - imap
  - oauth2
  - python
---
Remember my previous post about [checking out only new mails from a IMAP account with Python][1] ? The main issue with this was the absolute need for user's password.

The solution for this OAuth2&#8230; which has no decent support for Python 3. Well, it's not exactly true. Guys behind [oauthlib][2] did quite a good job but OAuth2 is such a generic framework that using a library quickly requires you to write more code than without anyway.

Soooo, enough talks. First, [get you API key here.][3] Make sure to create a web-application for this example.

Then it's merely a matter of reading/implementing the spec. Most documentation will warn you on how hard and overly complicated it is. It is NOT. Well, not for a hacker like you anyway 😉 Here are the basic ideas behind the protocol. I'll provide a link to the full source code at the end of this post.

  1. redirect the user you want to authenticate to authorization page
  2. authorization page redirects your user to your callback and gives you a CODE (must be pre-defined in the console or the process will miserably fail)
  3. on the server side, ask GOOGLE to exchange this CODE for a TOKEN + REFRESH_TOKEN
  4. GOOGLE gives you both back along with the token's lifetime.

Most of the time, the CODE must be consumed within 10min. DON'T use it twice, otherwise GOOGLE might consider it stolen and revoke every single token and refresh token granted with it. You've been warned.

The TOKEN will usually expire after an hour. Once expired, you will need to renew it. If you blindly used the provided snippet (which I do not recommend given it's draft quality), your application specified that it was in offline mode i.e your _user_ is not always online while you application accesses his account. Hence, you got a REFRESH TOKEN from Google to refresh the access token yourself. This second token never expires unless the user explicitly revokes your application access.

The last step is now to get the job done and authenticate to the Gmail IMAP server using the provided token. Luckily, this is the easiest part.

<pre class="brush: python; title: ; notranslate" title="">auth_string = 'user=%s\1auth=Bearer %s\1\1' % (username, access_token)
imap_conn = imaplib.IMAP4_SSL('imap.gmail.com')
imap_conn.authenticate('XOAUTH2', lambda x: auth_string)
</pre>

That's it, you done !

Full source code (~94 loc): <https://gist.github.com/jtlebi/5673096>

Next steps:

  * Make this code clean (really !)
  * Add state checking, this is essential both for anti-forgery checks and to track which user you were authenticating&#8230;
  * Add anti-forgery checks on the token by checking it's ignature
  * Plug the token refresh code in (needs to be called roughly every hours)

 [1]: https://blog.jtlebi.fr/2013/04/12/fetching-all-messages-since-last-check-with-python-imap/ "Fetching all messages since last check with Python + Imap"
 [2]: https://pypi.python.org/pypi/oauthlib
 [3]: https://code.google.com/apis/console#access