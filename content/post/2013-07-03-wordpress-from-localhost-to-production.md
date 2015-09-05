---
title: 'WordPress: from localhost to production'
author: Jean-Tiare Le Bigot
layout: post
date: 2013-07-03
url: /2013/07/03/wordpress-from-localhost-to-production/
categories:
  - Dev-Web
  - Sysadmin
tags:
  - php
  - production
  - wordpress
---
Yesterday, a friend of mine asked me urgent help. He fully developed a WP based website for a research project on _localhost/his_website_. As WP stores _full links_ pretty much everywhere in the database, his website was obviously completely broken when he moved it to production on _his_website.com_.

I quickly put some PHP lines of codes together to fix the whole DB at once. Feel free to re-use it in your own projects.

**usage**:

  * put the script on your server, for example /website/root/wordpress_production.php
  * configure DB connection + old and new URL
  * visit http://www.your\_website.com/wordpress\_production.php (you should see nothing)
  * you're done !



DISCLAIMER: this script comes with NO WARRANTY. USE IT AT YOUR OWN RISKS.