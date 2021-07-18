---
title: Investigating DynamoDB 5sec latency
author: Jean-Tiare Le Bigot
layout: post
date: 2012-10-11
url: /2012/10/11/investigating-dynamodb-5sec-latency/
categories:
  - Cloud
tags:
  - amazon
  - boto
  - dynamodb
  - dynamodb-mapper
  - investigation
  - latency
---
It goes without saying that a 5000ms latency is&#8230; _unacceptable_ in a real-time environment. Honestly, we first blamed our [home-grown DynamoDB-Mapper][1] and, indeed found, and fixed, a nasty design. [Here is the specific commit][2] for those liking juicy details <img src="https://blog.jtlebi.fr/wp-includes/images/smilies/simple-smile.png" alt=":)" class="wp-smiley" style="height: 1em; max-height: 1em;" />

Ok, so &#8220;case closed&#8221; you might think. Sadly not, it did not change anything but since this behavior was random and the application still under very low load (development environment) it took some time to spot it again.

Case re-opened.<!--more-->

Diving deeper in CloudWatch, I saw these pick latency in the stat. Interestingly enough, this was always like 5000 + n milliseconds. Where &#8216;n' is small and pretty close to the normal average latency observed on DynamoDB. After mailing directly Amazon's support about this specific issue, it appeared that this intuition was right. 5 sec it the failure timeout on their side.

We already know that data is spread over partitions. But this &#8220;partitions&#8221; might simply be instances running as part of a cluster. This cluster would then be exposed by an ELB with failure timeout set to 5sec. From my early tests, I noticed that there is 2 exposed partitions on a nearly empty table at a throughput of 1000. It now appears that both partition contains the whole dataset. Good!

Mystery solved ? Dunno. I have no clue how DynamoDB is actually built and all this is jealously kept as an &#8216;IP' secret, which I can understand.

So, most of the time DynamoDB is indeed a great choice. But, sometimes, you may experience unusual latencies. In this case, feel free to tell the support so that they can drop an eye.

Last advice: always keep profiling informations. I was asked for the &#8216;TransactionID' and suddenly felt stupid as we have none. Bad luck. If you use the great [Boto library][3], do not forget to configure &#8216;boto.perflog', I contributed it for this very purpose <img src="https://blog.jtlebi.fr/wp-includes/images/smilies/simple-smile.png" alt=":)" class="wp-smiley" style="height: 1em; max-height: 1em;" />

Oh, If you read this down to that point, you may be interested in some [common DynamoDB recipies][4] too.

 [1]: http://pypi.python.org/pypi/dynamodb-mapper "(Python) DynamoDB Mapper"
 [2]: https://bitbucket.org/Ludia/dynamodb-mapper/changeset/059791c53426e92556a9c20a3376db298be38a37 "commit about always filling transactions"
 [3]: http://docs.pythonboto.org/en/latest/index.html "Python Boto library"
 [4]: https://blog.jtlebi.fr/2012/10/07/common-dynamodb-questionsmisconceptionsrecipes/ "Common DynamoDB questions/misconceptions/recipes"