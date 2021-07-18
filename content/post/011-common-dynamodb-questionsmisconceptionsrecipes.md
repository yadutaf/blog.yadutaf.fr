---
title: Common DynamoDB questions/misconceptions/recipes
author: Jean-Tiare Le Bigot
layout: post
date: 2012-10-07
url: /2012/10/07/common-dynamodb-questionsmisconceptionsrecipes/
categories:
  - Cloud
tags:
  - amazon
  - Cloud
  - dynamodb
---
DynamoDB is a key:value store of the NoSQL family developed and offered by Amazon as part of AWS. It focuses on high performance throughput vs functionality.

I started to work with DynamoDB 3 month ago. It is lean enough to be easily mastered and I started answering more and more advanced questions from my colleagues and then from SO people.

## <a name="h.r4l2vhnrpon2"></a>DynamoDB is NOT NoSQL Database

DynamoDB belongs to the huge family of NoSQL. But NoSQL does not define what it is. It defines what it is not not. DynamoDB is a Key:Value store, much closer to Redis or Cassandra than it is to MongoDB (document database) or FlockDB (graph database).<!--more-->

But the fact is that most people moving to DynamoDB comes from *SQL or MongoDB. At least, my company does. As most people asking for help on SO. DynamoDB is the first Key:Value Database to be brought to a wide audience and this is thanks to Amazon. Hence a lot of misconceptions, at first.

Let me (try to) sum up:

  * **SQL oriented**: highly relational data. Critical data requiring ACID. Banking, customer managment.
  * **Document oriented**: mostly standalone data, 1-to-1 or 1-to-n relations. This is, in my opinion,  the most intuitive to use or for prototyping. Most applications can use it.
  * **Graph oriented**: highly, and arbitrarily linked data. Network management, social networks, CMDB, …
  * **Key:Value oriented**: where blazing fast performance are needed. Model data with query in mind, not the other way around.

> I like to compare Key:Value stores to RISC processors. Reduced instruction set, predictable behavior/time.

## <a name="h.js6b59ucu505"></a>DynamoDB is NOT a SQL database

Yeah, what you read is “de-normaliztion”. This topic is implied by the previous one. This is the point. Depending on the context, you may want to duplicate you data, “de-normalize”, to make queries fast.

  * There is no auto_inc feature, even if you can emulate it (see below)
  * There is no JOIN operations (who said “EMR” ? sights&#8230;)
  * You can not “SELECT” arbitrary fields (SCAN is BAD)
  * You can not &#8230;

> To make it simple, (DynamoDB ⊂SQL) but (SQL ⊄DynamoDB)

## <a name="h.t1u6qh1ggqlz"></a>Getting an auto_inc-like behavior

Ok, this is both possible and reliable. But please, think twice before using it ! Most of the time when you use it you should rethink your modeling. This is the first feature that was added to DynamoDB-mapper, long before I took over the development. It has never been used internally. I only refactored it to be harmless.

Put it to work requires

<ol start="1">
  <li>
    <a href="http://docs.amazonwebservices.com/amazondynamodb/latest/developerguide/WorkingWithDDItems.html">Atomic counter</a>, provided by UpdateItem’s ADD operation
  </li>
  <li>
    Helpers and black magic
  </li>
</ol>

**generate an id**: id=UpdateItem(ADD, 1, hash\_key=-1, return\_values=”UPDATED_NEW”)
  
**push a new item**: PutItem(hash_key=id, &#8230;)

When saving to an existing item, use UpdateItem or PutItem as usual, do not re-generate an ID or you’ll end up with duplicated/dead data.

First id generated will be 1. I store the “magic counter” at index -1 because 0 is a neutral value. That is to say, poorly initialized items will go there and you’ll loose the counter. No kidding, it occurred to me. Once.

For more background, I can only recommend you to read [this extract of DynamoDB-mapper’s documentation][1] I wrote 2 month ago.

> Thanks to atomic counters, auto_inc behavior is possible. But do you need it ? I never found a real use-case.

## <a name="h.vtv3e1yckbsj"></a>Storing article revisions, getting always the latest

After my DynamoDB presentation, a colleague asked me how we could let’s say, store blog posts revisions and efficiently get the most recent one. I did not know whether it was possible and told him frankly.

It’s only a month later (after crawling the documentation at least for the 10th time) that I found it. I felt ashamed because it’s pretty easy when you think twice of it <img src="https://blog.jtlebi.fr/wp-includes/images/smilies/simple-smile.png" alt=":)" class="wp-smiley" style="height: 1em; max-height: 1em;" />

  * **hash_key**: article identifier. A “slug” for example
  * **range_key**: revision id. DateTime for example.
  * **payload**: article body, tags, ….

As you may have notice, this model avoids twice the “auto-inc” temptation :p

**Push a new article**: PutItem(hash\_key=slug, range\_key=revision_id=now, ….)
  
**Push a new revisions**: same as for a new article (Yeah !)
  
**Get all revision id**: Query(hash\_key=slug, range\_key\_condition=None, fields\_to\_get=[‘revision\_id’])
  
**Get a specific revision**: same as above, with no field filter
  
**Get the last revision**: Query(hash_key=slug, ScanIndexForward=True, limit=1)

Of course, all this assumes that your “article identifier” is immutable and that your “revision id” follows a monotonic strictly growing function.

> DynamoDB is excellent when it comes to revisions. The single &#8220;trick&#8221; to remember is &#8220;reverse scan + limit=1&#8221;

## <a name="h.g2za5919ol0l"></a>The “third key trick”

This was an internal question at my job. A backend engineer asked me how I would do to find all challenges initiated

<ol start="1">
  <li>
    in a given world
  </li>
  <li>
    by a given player
  </li>
  <li>
    not older than a week
  </li>
</ol>

Once you have a whiteboard in front of you, it becomes easier. The solution we came up with was to build a compound range\_key and then play with the magic of Query with ‘BEGINS\_WITH’ or ‘GT’ comparison operators.

  * **hash_key**: world_id
  * **range_key**: playerid+’:’+datetime

So, let’s say you have 3 “keys” ‘a’, ‘b’, ‘c’. The range key will be a combination of ‘b’ and ‘c’. So that you can

  * Query for all (or some) ‘a’
  * Query for all or some ‘a’ and ‘b’ using comparison operators
  * Get item at ‘a’, ‘b’, ‘c’

> Thanks to the power of queries, you can simulate a third key by concatenating two and then apply query filters.

## <a name="h.1shlqfirwps3"></a>How do I query a non key field ?

Have double checked your model ? Have you considered the “3rd key trick” above ?

I know, sometimes, you just have no choice, Data is here but needs changes. Chris Moyer wrote an excellent [blog post on this subject][2].

> He basically suggests to build (and) maintain special tables as custom indexes. I never tried it myself but it sounds really good.

## That's all folks

Well, all I can think of for today <img src="https://blog.jtlebi.fr/wp-includes/images/smilies/simple-smile.png" alt=":)" class="wp-smiley" style="height: 1em; max-height: 1em;" />

 [1]: http://dynamodb-mapper.readthedocs.org/en/latest/api/model.html#using-auto-incrementing-index
 [2]: http://blog.coredumped.org/2012/01/amazon-dynamodb.html