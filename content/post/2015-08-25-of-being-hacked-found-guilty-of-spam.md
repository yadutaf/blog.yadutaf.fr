---
title: Of being hacked, found guilty of spam
author: Jean-Tiare Le Bigot
layout: post
date: 2015-08-25
url: /2015/08/25/of-being-hacked-found-guilty-of-spam/
categories:
  - Sysadmin
tags:
  - postfix
  - spam
  - sysadmin
---
A few days ago, my hosting company sent me an automated email notifying me that port 25 had been blocked on my personal server. Cause: It had been found guilty of sending spam. As I'm not (at least officially) in the spam business, this could only mean one thing: I got hacked.

I was shocked. If felt to me as though I was having a car accident.

The first think to do in such situations is to restrict to the bare minimum connections from the outside world to regain control of the machine. In my case, I rebooted the server to rescue mode with only SSH access. This means mail server downtime BUT SMTP protocol is reliable by design. Actually, it has been developed when Internet barely existed and mails where directly hosted on terminals with intermittent connexions. Hence, not an issue.

Next, inspect postfix queue to get an overview:

<pre class="brush: bash; title: ; notranslate" title="">postqueue -p | head
</pre>

Dumping a random email from the queue is also a good idea:

<pre class="brush: bash; title: ; notranslate" title="">postcat -qv POSTFIX_QUEUE_ID
</pre>

This gives a good idea of where the bulk of the emails came from. In this specific scenario, most mail (~55K) were coming from &#8220;@blog.jtlebi.fr&#8221;. Which is a pretty good news since NO legitimate mail is ever sent from this domain. Anyway, at this point, you should be able to infer basic patterns.

Time to filter out the spam. The film-hacker way: with a shiny progress bar. Actully, this is not about hype but truly about getting feedback. Filtering 10s of thousands of mails using postfix tools takes a _very_ long time. You need to have an ETA. Here is the command I used:

<pre class="brush: bash; title: ; notranslate" title="">CANDIDATES="grep -rlP '(MAILER-DAEMON|@blog\.jtlebi\.fr)' /var/spool/postfix/deferred/"; (
    eval $CANDIDATES   # get the list of mails, directly from the pool
    | tee deleting     # track actions
    | grep -o '[^/]*$' # extract POSTFIX_QUEUE_ID
    | pv -lns $(eval $CANDIDATES | wc -l) -i0.1 # compute progress based on processed lines (mails) vs matching files (mails) in the spool.
    | postadmin -d -   # delete mail by  POSTFIX_QUEUE_ID (1 per line)

) 2&gt;&1
| dialog --no-lines --no-shadow  --gauge "Delicately filtering away da F*cking spam... " 7 70 # The hype thing
</pre>

After that, before re-opening accesses, do not forget to close the holes the hacker came in through. Temporary fix was to upgrade all, disable most plugins. Long term fix ? **KILL WORDPRESS**.