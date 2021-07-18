---
title: Fetching all messages since last check with Python + Imap
author: Jean-Tiare Le Bigot
layout: post
date: 2013-04-12
url: /2013/04/12/fetching-all-messages-since-last-check-with-python-imap/
categories:
  - Dev-Web
  - Non classé
tags:
  - imap
  - python
  - sync
---
Recently, in a freelance project I had to parse incoming mails wherever they are in the mail account and, preferably, avoid re-parsing the whole mail account only for a couple of new mails.

Fortunately, there is the low level [imaplib][1] module in Python's toolbox. But, curiously enough, while the solution is quite simple, I have not been able to find any good solution on the net&#8230;

By default, when you perform a [SEARCH][2] on an IMAP folder, it will provide you will _relative_ identifiers in the folder meaning that any operation on the folder might alter them. Another option, not obvious for an IMAP newcommer is to use UIDs instead. These constants IDs uniquely identifies a given during its lifetime in the mail account and are allocated in a strictly growing manner. This basically means that you can rely on this information to affirm that a given mail arrived in the mailbox after another one.

Last interesting property, the IMAP SEARCH command return all mails whose UID is in a given range, _wildcard included_.

For this projects, I also wrote it as a generator so that it yields at each new mail, if any. Here is a stripped down code snippet highlighting the main steps from connection negotiation to yielding individual mail bodies:

<pre class="brush: python; title: ; notranslate" title=""># -*- coding: utf-8 -*-

import imaplib

# new mail generator --&gt; yield after each mail to save resources
def new_mail(last_uid, host, port, login, password):
    # connect
    mail_server = imaplib.IMAP4(host, port)

    # authenticate
    mail_server.login(login, password)

    # issue the search command of the form "SEARCH UID 42:*"
    command = "UID {}:*".format(last_uid)
    result, data = mail_server.uid('search', None, command)
    messages = data[0].split()

    # yield mails
    for message_uid in messages:
        # SEARCH command *always* returns at least the most
        # recent message, even if it has already been synced
        if int(message_uid) &gt; last_uid:
            result, data = mail_server.uid('fetch', message_uid, '(RFC822)')
            # yield raw mail body
            yield data[0][1]

# usage example
for mail in new_mail_generator(last_uid=42,
                               host="imap.example.com", port=143,
                               login="user@exampl.com",
                               password="password"):
    # do something useful with raw mail
    pass

</pre>

Going further:

  * Loop over all folders. (hint: see &#8220;list&#8221; method to get a folder list)
  * Save sync status to a persistent storage like a database
  * Parse mail body
  * Handle secure connections

If you need any help in your Python/Imap related project, [feel free to get in touch][3] <img src="https://blog.jtlebi.fr/wp-includes/images/smilies/simple-smile.png" alt=":)" class="wp-smiley" style="height: 1em; max-height: 1em;" />

 [1]: http://docs.python.org/3.2/library/imaplib.html
 [2]: http://tools.ietf.org/html/rfc3501#section-6.4.4
 [3]: https://blog.jtlebi.fr/contact/ "Contact"