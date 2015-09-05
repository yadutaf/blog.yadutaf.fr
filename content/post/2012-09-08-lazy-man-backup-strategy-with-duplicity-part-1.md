---
title: Lazy man backup strategy with duplicity
author: Jean-Tiare Le Bigot
layout: post
date: 2012-09-08
url: /2012/09/08/lazy-man-backup-strategy-with-duplicity-part-1/
categories:
  - Sysadmin
tags:
  - backup
  - duplicity
  - OVH
---
I recently moved to a new dedicated server and decided it also was a good to time do start doing things &#8220;the good way&#8221; <sup>tm</sup>. A good backup strategy was especially needed.

Most articles I found on the net explains how to backup your data and they do it well. But they lack something essential that might someday become a real issue in case there is a disaster. Main disk crash ? Yes, you know what I mean <img src="https://blog.jtlebi.fr/wp-includes/images/smilies/simple-smile.png" alt=":)" class="wp-smiley" style="height: 1em; max-height: 1em;" />

Let me introduce [Duplicity][1] command line utility. It supports multiple storage backends including S3, FTP, SFTP as well as regular mounted folder. It supports incremental backup and automatic older archive removal. Last but not least: all archives are fully encrypted by default !<!--more-->

That's enough words.

  1. Define **backup** frequency. I use daily for my server, weekly for my personal computer
  2. Define **full backup** frequency. I use one per month
  3. Define **full backup lifetime**. I use 6 month as this is not too critical
  4. Define **incremental backup lifetime**. I use 1 month

Lets rephrase all this into plain English: Backup my data every single day. Every month, start backup from scratch. Keep a full month of daily history. For older, you can keep only the monthly full copy.

Incremental backup helps to save space on the remote storage but slows down the recovery as every intermediate file up to the previous full backup will need to be read.

Here is my generic backup script. It is fully configurable and will automatically walk into /root/server/backup.d to find target files. These are trivial files containing the full path to a single folder to save. The name of the file determines the target.

<pre class="brush: bash; title: ; notranslate" title="">#!/bin/bash

#File: /root/server/backup.sh

# to backup a set of folder, put its name
# in a file in backup.d. There maybe only
# one folder per file
# - enable  the backup with 'chmod +x'
# - disable the backup with 'chmod -x'

FTP_URL="ftp://&lt;login&gt;@&lt;server.tld&gt;/backup"
FTP_PASS="&lt;your ftp pass goes here&gt;"
BK_FULL_FREQ="1M" # create a new full backup every...
BK_FULL_LIFE="6M" # delete any backup older than this
BK_KEEP_FULL="1"  # How many full+inc cycle to keep
BK_PASS="&lt;your very secret encryption key goes here&gt;"

export APT='apt-get -q -y'
export CONF='/root/conf'

################################
#        enter section
################################

function enter_section {
  echo ""
  echo "=============================="
  echo "$1: $2"
  echo "=============================="
}

################################
#         do backup
################################

function do_backup {
  enter_section "backing up" "$2 -&gt; $1"
  export FTP_PASSWORD=$FTP_PASS
  export PASSPHRASE="$BK_PASS"
  duplicity --full-if-older-than $BK_FULL_FREQ $3 "$2" --asynchronous-upload "$FTP_URL/$1"
  duplicity remove-older-than $BK_FULL_LIFE --force "$FTP_URL/$1"
  duplicity remove-all-inc-of-but-n-full $BK_KEEP_FULL --force "$FTP_URL/$1"
  unset PASSPHRASE
  unset FTP_PASSWORD
}

################################
#      run sub-scripts
################################

# backup should be independant from the system state
# always make sure the required tools are ready
$APT install duplicity ncftp &gt; /dev/null

for PARAM in /root/server/backup.d/*
do
  if [ -f $PARAM -a -x $PARAM ]
  then
    do_backup $(basename "$PARAM") `cat $PARAM`
  fi
done

exit 0
</pre>

Example: Backup /root folder to &#8220;42&#8221; subfolder of backup target:

<pre class="brush: bash; title: ; notranslate" title="">echo "/root" /root/server/backup.d/42
chmod +x /root/server/backup.d/42
</pre>

Run it daily as root:

<pre class="brush: bash; title: ; notranslate" title="">echo "25 2  * * * root /root/backup.sh" &gt;&gt; /etc/crontab
</pre>

Beware that there is a major **drawback** with this method. Backing-up **/var/lib/mysql** with this method will probably result in **data corruption** as the tables are not locked. Again, most articles forgets to mention this&#8230; You can workaround this by first running &#8216;mysqldump' then archiving the resulting file. This is left as an exercise to the reader 😉

In a next article, I will try yo address the **restore** issue.

 [1]: http://duplicity.nongnu.org/ "Duplicity backup"