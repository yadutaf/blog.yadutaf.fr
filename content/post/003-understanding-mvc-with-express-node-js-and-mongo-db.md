---
title: Understanding MVC with Express/Node.js and mongo.db
author: Jean-Tiare Le Bigot
layout: post
date: 2011-11-20
url: /2011/11/20/understanding-mvc-with-express-node-js-and-mongo-db/
categories:
  - Dev-Web
tags:
  - express
  - jade
  - mongo.db
  - mongoose
  - mvc
  - Node.js
  - registration form
---
Coming from the PHP/MySQL world, I got used to frameworks such as the lightweight [CodeIgniter][1] or the very complete  [Symfony][2] and I missed clean MVC coding. My previous node.js app barely stand in a single controller [as it was a reverse proxy][3]. This time, I wondered how I could write a bare minimum clean registration form.

For this &#8220;application&#8221;, the goals were to

  * Provide users with a registration form
  * Provide us with a registered user list and a CSV exporter
  * Store the registrations in a Mongo.DB collection

<!--more-->

As this post is pretty long, not all the source code will be provided in this post. You can download them as well as to test a simplified version of a real-world(tm) app I did to provide visitors in an event to register and leave their contact on my company's stand.

  * Demo application: <http://test1.jtlebi.fr/>
  * Full source Code: [inscrit-demo.zip][4]

To use the source code directly, you will need to run these 2 commands from the zip root directory :

<pre class="brush: bash; title: ; notranslate" title="">npm install
node app.js</pre>

The following parts of this post will assume that you start from scratch, without this archive.

# Setup

If not yet done, go to http://nodejs.org/ and download the Node.JS installer for your platform. For linux users, I recommend you to build it from source as this is a fast moving project and most distributions packages are outdated.

You will also need Mongo.DB, which is available from this page: <http://www.mongodb.org/>. For those not already familiar with it, Mongo.DB is a document oriented Database Engine. Unlike relational databases no schema is required and the query are done with a DSL (Domain Specific Language). This make this engine very fast and easy to replicate to the cost of managing yourself data coherence.

The last thing you will need is the Node.JS package manager. To install it on UNIX like Operating System is pretty easy :

<pre class="brush: bash; title: ; notranslate" title="">curl http://npmjs.org/install.sh | sh</pre>

Users of Windows will sadly need to follow a pretty tedious procedure which is documented here : <http://npmjs.org/doc/README.html>.

You are now ready to start building your application

<pre class="brush: bash; title: ; notranslate" title="">npm install -g express #get the framework
express . #setup the project with default settings</pre>

Edit the Manifest :

<pre class="brush: jscript; title: ; notranslate" title="">//file package.json
{
"name": "MyRegistrationApp"
, "version": "1.0.0-pre"   /* Version number. No Space nor special chars */
, "private": true
, "dependencies": {
"express": "2.5.0"     /* Framework */
, "jade": "&gt;= 0.0.1"     /* Template engine */
, "mongoose": "&gt;=2.3.13" /* Node.JS Mongo.DB API */
}
}</pre>

Please note that comments in JSON  are NOT legal. You must strip them out of this snippet to use it !

Now that the project is ready we can install all the dependencies. Unlike Express installation, we skip the &#8220;-g packageName&#8221;. &#8220;-g&#8221; stands for &#8220;global&#8221;. In this case we install them in the project scope only. This way, we can have multiple projects with different versions of the libraries. When &#8220;packageName&#8221; is not provided, NPM will automatically look for the &#8220;dependencies section&#8221; in the &#8220;package.json&#8221; file.

<pre class="brush: bash; title: ; notranslate" title="">npm install</pre>

The resulting directory structure should look like this. If some directories are missing, do not hesitate to create them manually <img src="https://blog.jtlebi.fr/wp-includes/images/smilies/simple-smile.png" alt=":-)" class="wp-smiley" style="height: 1em; max-height: 1em;" />

<pre>project_root/
    - public/
        - javascripts/
        - stylesheets/
        - images/
    - models/
    - views/
    - routes/
    - config/
    - node_modules/
        ...</pre>

In order to spare some time and focus on the development work, I suggest you to use the twitter css bootstrap. It will provide you with a nice and clean stylesheet. In the following code snippets of this article, I'll assume you are using this framework.

# The Model

The model is the place where the data type is defined. The first step is to identify the required fields and their constraints. To keep the example minimal, I'll use just a little subset :

  * Title. Mandatory. Must be one of 
      * Mr
      * Ms
      * Miss
      * Mrs
  * Firstname. Mandatory.
  * Lastname. Mandatory.
  * E-Mail. Mandatory.
  * Date. Mandatory. Auto-generated.

This leads to the following schema :

<pre class="brush: jscript; title: ; notranslate" title="">var MemberSchema = new Schema({
    id        : ObjectId,
    title     : { type: String, required: true, enum: ['Mr', 'Mrs', 'Mme', 'Miss'] },
    lastname  : { type: String, required: true, uppercase: true, trim: true},
    firstname : { type: String, required: true},
    mail      : { type: String, required: true, trim: true, index: { unique: true, sparse: true } },
    date      : Date
});</pre>

Let's write it in file models/MemberModel.js. To get it to work, we need to import Mongoose API in the file header :

<pre class="brush: jscript; title: ; notranslate" title="">var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.ObjectId;</pre>

You noticed that the &#8220;date&#8221; field should be auto-generated. This can be achieved with a default value. This time, although this could be done in the schema, we will do it separately to show how to decorate an existing schema. Please note that another extremely powerful tool is available in Mongoose. These are the middleware.

<pre class="brush: jscript; title: ; notranslate" title="">// Date setter
MemberSchema.path('date')
    .default(function(){
        return new Date()
    })
    .set(function(v){
        return v == 'now' ? new Date() : v;
    });</pre>

The last step for the model is to expose it to the application chunk :

<pre class="brush: jscript; title: ; notranslate" title="">module.exports = mongoose.model('Members', MemberSchema);</pre>

# The view

The view is the place where the actual web page you see is generated from data computed in the controller. In small projects such as this one, I usually code the controller at last since it is the &#8220;glue&#8221; between the Model and the View.

For this example, I did 2 views. The first one is the registration form while the second one displays a list of registered members.

Since the header of theses pages are common, we will put it in a separate file called &#8220;views/layout.jade&#8221;. The first line of this templates tells the template engine to insert the HTML5 DOCTYPE. As in python, there is no closing tags but the indentation is semantical. This helps to keep the code readable ! The first CSS file is provided by the bootstrap CSS framework maintained on Github by Twitter. An &#8220;=&#8221; sign tells Jade to load a variable, attribute list is between &#8220;(&#8221; and &#8220;)&#8221; and the text to put write is what follows.

<pre class="brush: plain; title: ; notranslate" title="">!!! 5
html
  head
    title= title
    link(rel='stylesheet', href='/stylesheets/bootstrap.css')
    link(rel='stylesheet', href='/stylesheets/styles.css')
    //if lt IE 9
        script(src="http://html5shim.googlecode.com/svn/trunk/html5.js", language="text/javascript")
  body!= body</pre>

The conditional tag &#8220;lt IE 9&#8221; allows us to use HTML 5 tags in our layout. The other half of this trick takes place in style.css :

<pre class="brush: css; title: ; notranslate" title="">/*[...]*/
/*HTML 5 compat*/
header, section, article, nav, footer, aside, hgroup{
    display: block;
}
/*[...]*/</pre>

We will then define our 2 views: views/index.jade and views/list.jade They both contain the same header and same footer. You also can notice the use of &#8220;header&#8221; and &#8220;footer&#8221; tags. These are 2 new HTML tags adding some semantic to the web.

<pre class="brush: plain; title: ; notranslate" title="">.container
    .content
        header.page-header
            h1 Title text
                small.subtitle Subtitle text
[...]
    footer
        p © Illyse 2011</pre>

The first part of views/index.jade uses a loop to print messages and errors, if need be, right after the title :

<pre class="brush: plain; title: ; notranslate" title="">.row
            article.span10
                - if (errors.length)
                    - errors.forEach(function(error){
                        .alert-message.error= error
                    - })
                - if (messages.length)
                    - messages.forEach(function(message){
                        .alert-message.success= message
                    - })</pre>

The remaining parts of this file basically defines a form using the new HTML 5 fields such as &#8220;phone&#8221;, &#8220;url&#8221; and &#8220;email&#8221; and new attributes such as &#8220;required&#8221; helping to perform some basic validation before the submission. As this is a very verbose part, I will skip it on this post.

The body of views/list.jade basically loops over the members structures and displays all members in a table.

# The controller

The controller is the part that glues the views and the models together. It takes the input from the user, routes it, handle it and then triggers the render of the view.

For simplicity sake, I kept a single default controller &#8220;routes/index.js&#8221; with all the routing logic in the auto-generated &#8220;app.js&#8221;. It's probably not the best and cleanest way to do it but it's enough yet ;-).

The only added part to &#8220;app.js&#8221;

<pre class="brush: jscript; title: ; notranslate" title="">// Routes

app.get('/', routes.index);
app.get('/list', routes.list);
app.get('/csv', routes.csv);
app.post('/', routes.index_post);</pre>

The file &#8220;routes/index.js&#8221; has two parts. In the first, it loads dependencies such as the database driver, connection and model.

<pre class="brush: jscript; title: ; notranslate" title="">// loads model file and engine
var mongoose    = require('mongoose'),
    memberModel = require('../models/MemberModel');

// Open DB connection
mongoose.connect('mongodb://localhost/mymembers');</pre>

The second part exports all function used by the router. The easiest one is the index page as it only triggers the render of the registration form.

<pre class="brush: jscript; title: ; notranslate" title="">// Home page =&gt; registration form
exports.index = function(req, res){
    res.render('index.jade', { title: 'My Registration App', messages: [], errors: [] });
};</pre>

This snippets tells express (the framework) to send the rendered version of template &#8220;index.jade&#8221; with this title, no message and no errors.

The other routes of this controller are all build on the same model. Nonetheless, an interesting one is the &#8220;csv&#8221; export because it both uses database access and an &#8220;advanced&#8221; render feature: the ability to specify the content type and so trigger a download to the proper application instead of just displaying plain text.

<pre class="brush: jscript; title: ; notranslate" title="">// Member list quick-and-dirty(tm) CSV export
exports.csv = function(req, res){
    memberModel.find({},function(err, docs){
        str = "";
        docs.forEach(function (member) {
            str += member.title;
            str += "; " + member.firstname;
            str += "; " + member.lastname;
            str += "; " + member.mail;
            str += "; " + member.date;
            str += "\n";
        });
        res.header('Content-type', 'text/csv');
        res.send(str);
    });
};</pre>

# Conclusion

This (long) post demonstrated and demystified quite a lot of modern technologies at once which may be a little confusing for a newcomer. Sadly, I could not get an in depth overview of these tools. It would have required many books ! Nonetheless, I hope it has been useful to you and help you getting started. have fun !

 [1]: http://codeigniter.com/
 [2]: http://symfony.com/
 [3]: http://blog.jtlebi.fr/2011/09/19/nodejs-reverse-proxy/ "Node.Js reverse proxy"
 [4]: http://blog.jtlebi.fr/wp-content/uploads/2011/11/inscrit-demo.zip