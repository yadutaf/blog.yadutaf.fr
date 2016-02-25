
<!DOCTYPE html>
<html lang="en-us">
<head>

  
  <meta charset="UTF-8">
  <title>
    Node.Js | Yet another enthusiast blog!
  </title>


  
  <meta name="viewport" content="width=device-width,user-scalable=no,maximum-scale=1,initial-scale=1">

  
  <link rel="canonical" href="http://blog.yadutaf.fr/tags/node/index.js/"/>

  
  <link rel="stylesheet" href="/css/sanitize.css">
  <link rel="stylesheet" href="/css/responsive.css">
  <link rel="stylesheet" href="/css/highlight_monokai.css">
  <link rel="stylesheet" href="/css/theme.css">
  <link rel="stylesheet" href="/css/custom.css">
  
  
  <link href="http://blog.yadutaf.fr/index.xml" rel="alternate" type="application/rss+xml" title="Yet another enthusiast blog!" />
  <link href="http://blog.yadutaf.fr/index.xml" rel="feed" type="application/rss+xml" title="Yet another enthusiast blog!" />

  
  <link rel="stylesheet" href="/css/hljs/solarized_dark.css">
  <script src="/js/highlight.pack.js"></script>
  <script>hljs.initHighlightingOnLoad();</script>

  <script>
  
  
  document.addEventListener("DOMContentLoaded", function (event) {
      var codeBlocks = document.getElementsByTagName("pre");

      for (var i = 0; i < codeBlocks.length; i++) {
          var block = codeBlocks[i];

          var regex = /brush\:\s([a-zA-z]+)/g;
          match = regex.exec(block.className);
          var brushName = "nohighlight";
          if (match != null) {
              var oldBrushName = match[1];
              if (oldBrushName == "csharp") oldBrushName = "cs";
              if (oldBrushName == "js") oldBrushName = "javascript";
              else {
                  brushName = oldBrushName;
              }
              block.className = "hljs " + brushName;
              hljs.highlightBlock(block);
          }
      }
  });
  </script>

</head>



<body>
<div class="container">

  
  <header role="banner">
    <div class="row gutters">
      <div id="site-title" class="col span_6">
        <h1><a href="http://blog.yadutaf.fr/">Yet another enthusiast blog!</a></h1>
        <h2>There is no great achievement whithout great challenges.</h2>
      </div>
      <div id="social" class="col span_6">
        <ul>
          <li><a href="/about">About me</a></li>
          <li><a href="https://twitter.com/oyadutaf" target="_blank">Twitter</a></li>
          
          <li><a href="https://github.com/yadutaf" target="_blank">GitHub</a></li>
          
        </ul>
      </div>
    </div>
  </header>


  
  <main id="list" role="main">
    <div class="article-header light-gray"><h1>#Node.Js</h1></div>
    
    <div class="summary">
      <h2><a href="http://blog.yadutaf.fr/2011/11/20/understanding-mvc-with-express-node-js-and-mongo-db/">Understanding MVC with Express/Node.js and mongo.db </a></h2>
      <div class="meta">
        Nov 20, 2011 &nbsp;
        
          #<a href="/tags/express">express</a>&nbsp;
        
          #<a href="/tags/jade">jade</a>&nbsp;
        
          #<a href="/tags/mongo.db">mongo.db</a>&nbsp;
        
          #<a href="/tags/mongoose">mongoose</a>&nbsp;
        
          #<a href="/tags/mvc">mvc</a>&nbsp;
        
          #<a href="/tags/node.js">Node.js</a>&nbsp;
        
          #<a href="/tags/registration-form">registration form</a>&nbsp;
        
      </div>
    </div>
    
    <div class="summary">
      <h2><a href="http://blog.yadutaf.fr/2011/09/21/about-proxying-wget-http-1-0-using-http-1-1-headers/">About proxying wget http 1.0 using http 1.1 headers </a></h2>
      <div class="meta">
        Sep 21, 2011 &nbsp;
        
          #<a href="/tags/http">HTTP</a>&nbsp;
        
          #<a href="/tags/node.js">Node.js</a>&nbsp;
        
          #<a href="/tags/wget">Wget</a>&nbsp;
        
      </div>
    </div>
    
    <div class="summary">
      <h2><a href="http://blog.yadutaf.fr/2011/09/19/nodejs-reverse-proxy/">Node.Js reverse proxy </a></h2>
      <div class="meta">
        Sep 19, 2011 &nbsp;
        
          #<a href="/tags/node.js">Node.js</a>&nbsp;
        
          #<a href="/tags/ovh">OVH</a>&nbsp;
        
          #<a href="/tags/reverse-proxy">reverse-proxy</a>&nbsp;
        
          #<a href="/tags/vhost">VHost</a>&nbsp;
        
      </div>
    </div>
    
  </main>


  
  <footer role="contentinfo">
    <div style="text-align:center;">
      <img src="/images/profile.jpg" width="64" height="64"><br>
      Jean-Tiare Le Bigot
    </div>
  </footer>


</div>

<script>
	(function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){
	(i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),
	m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)
	})(window,document,'script','//www.google-analytics.com/analytics.js','ga');
	ga('create', 'UA-25807049-1', 'auto');
	ga('send', 'pageview');
</script>

</body>
</html>
