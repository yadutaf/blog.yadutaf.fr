---
title: 'Anatomy of a virus: iTunesHelper.vbe 2/2'
author: Jean-Tiare Le Bigot
layout: post
date: 2013-11-20
url: /2013/11/21/anatomy-of-a-virus-ituneshelper-vbe-22/
categories:
  - Security
tags:
  - iTunesHelper
  - security
  - virus
---
**Disclaimer**: This post is about a real virus, really seen in the wild. It was written on the sole goal of helping the reader to better protect itself. This post is _NOT_ about writing viruses. I will _NOT_ provide any source code nor any directions to build a virus. If this is what you were looking for: Please, I beg you to change your mind and start building something useful to the community instead of attacking it. Thanks for reading.

This post is the source-code analysis part of the article. For an introduction to the iTunesHelper.vbe virus and a more qualitative approach, [you may be interested in reading the first part&#8230; first][1].

**1/ What does it look like ?**

  * _Name_: iTunesHelper.vbe
  * _Target system_: Windows >= XP
  * _Propagation vector_: Replace files by shortcuts to virus code on USB drive root
  * _Hiding techniques_: 
      * Hides real files as well as himself as &#8220;system files&#8221;
      * Use a name close to a real world program &#8220;iTunesHelper.exe&#8221;
  * _Symptoms_: 
      * All files on USB drive root are shortcuts to &#8220;strange/suspect&#8221; script
      * Process &#8220;wscript&#8221; using ~1/2GB of memory
      * Real files visible when &#8220;system files&#8221; are not hidden

**2/ How does it work ? - Dissimulation**

**1st** level of dissimulation: _dissuasion_. The file appears to be 65MB big. While this seems small, most text editors (who said Notepad ?) just assumes text files are no more than a couple of KB big. It makes it almost impossible to read it. Moreover, it starts with empty lines discouraging to scroll down to the real code. We'll make it fast.
  
<!--more-->

<pre class="brush: plain; title: filter iTuneHelper.vbe empty lines noise; notranslate" title="filter iTuneHelper.vbe empty lines noise">jean-tiare@laptop:~$ grep -E "^\\s*$" iTuneHelper.vbe | wc -l
34 598 142 # huh huh, ~34 *millions* of empty lines. Useful...
jean-tiare@laptop:~$ grep -vE "^\\s*$" iTuneHelper.vbe | wc -l
43 # "real" code
jean-tiare@laptop:~$ grep -vE "^\\s*$" iTuneHelper.vbe &gt; iTuneHelper-trimmed.vbe
</pre>

The code now looks like:

<pre class="brush: vb; title: iTuneHelper-trimmed.vbe; notranslate" title="iTuneHelper-trimmed.vbe">Audi = Mercedes("&lt;base64 'hidden' payload&gt;")
EXECUTE (Audi)
Function Mercedes(data)
     Mercedes=decodeBase64(data)
End Function
Function decodeBase64(ByVal base64String)
' trimmed
End Function
</pre>

This basically decodes a base64 encoded the payload and run it. \``decodeBase64`\` is standard and has been removed from this snippet for brevity. Nothing fancy, here apart from the variable's name.

**2nd** level of dissimulation: _base64, fun var names_. That's an easy one. It can be manually decoded for example with the following one liner. Notice that I also trim empty lines as it re-uses the same trick as before:

<pre class="brush: plain; title: decode iTuneHelper.vbe base64 payload; notranslate" title="decode iTuneHelper.vbe base64 payload">jean-tiare@laptop:~$ head -n1 iTuneHelper-trimmed.vbe | cut -d\" -f2 | base64 -d &gt; iTuneHelper-decoded.vbe
</pre>

It basically takes the part between double quotes on the first line and feeds it to base64 decoder and finally stores the result.

We notice the same kind of fanciness in the variables names but with names (Benjamin, Christophe, Raphael, Damien, Pierre) instead of cars.

**3/ How does it work ? - Virus skeleton**

As stated in the disclaimer, I wont provide real source code. But here is what the code roughly looks like once all &#8220;obfuscation&#8221; techniques have been bypassed.

<pre class="brush: vb; title: iTuneHelper-decoded.vbe; notranslate" title="iTuneHelper-decoded.vbe">' Init
Benjamin = "&lt;command server fqdn&gt;"
Christophe = -1 'Port on command server
Raphael = "&lt;install dir on target&gt;"
Damien = True
Pierre = True

' Main loop:
'   - install (*each*) iteration
'   - contact command server
'   - execute command
'   - sleep 5s&lt;/p&gt;

' Command handlers

Sub install
On Error Resume Next
' trimmed code
' handles USB propagation
End Sub

Sub information
On Error Resume Next
' trimmed code
' leaks informations, especially Installed AV software, if any.
End Sub

'and so on...
</pre>

**4/ How does it work ? - (Un-)Install**

The main loop runs roughly every 5s. The _first_ thing it does is call \``install`\` function. (no, the last thing is not a call to \``uninstall`\` function).

Here is what it basically _looks_ like:

<pre class="brush: vb; title: install procedure; notranslate" title="install procedure">Sub install

' 1/ ensure start mode
' make sure it starts on session start
setRegistryKey "HKEY_CURRENT_USER\software\microsoft\windows\currentversion\run\&lt;virus name&gt;"
' attempts to even set it globally (Admin session ?)
setRegistryKey "HKEY_LOCAL_MACHINE\software\microsoft\windows\currentversion\run\&lt;virus name&gt;"

' 2/ copy virus file
filesystemobj.copyfile wscript.scriptfullname, "&lt;destination 1&gt;", True
filesystemobj.copyfile wscript.scriptfullname, "&lt;destination 2&gt;", True

' 3/ infect each USB Mass Storage
For each drive in filesystemobj.drives

    ' 3.1/ is it a mass storage ?
    If isUsbMassStorage drive Then
        ' 3.2 install file
        filesystemobj.copyfile wscript.scriptfullname, "&lt;usb root&gt;", True
        ' 3.3 hide it (no snippet)
        ' 3.4 for each file (and folder) on storage root:
        For Each file in filesystemobj.getfolder( drive.path & "\" ).Files
            ' 3.4.1 hide each reach file (no snippet)
            ' 3.4.2 create *visible* shortcut to each real file *first* calling the virus (no snippet)
            ' 3.4.3 pretend to be the real file by forcing the icon (no snippet)
        Next
    End If

Next

End Sub
</pre>

On the opposite, the \``uninstall`\`does exactly the reverse with one noteworthy difference: It is executed only after the control server requests so, never automatically.

**5/ How does it work ? - Backdoor**

So, this virus is build around a main loop sleeping for 5s after each run. It also starts by (re-)installing the virus. Up to this point that still is a common virus. What it does right after makes it also a Trojan Horse. Nice <img src="https://blog.jtlebi.fr/wp-includes/images/smilies/frownie.png" alt=":(" class="wp-smiley" style="height: 1em; max-height: 1em;" />

To make it short it

  1. Connects to a server
  2. Reads the command from the answer
  3. Execute it

There are 13 supported commands, some of them doing similar things. The most important is that it allows an attacker to trigger an auto-update, (up|down)-load arbitrary files, run arbitrary commands, &#8230;: do anything. And _that_ is the scary part.

**6/ Last word**

I find strange to find such simple script-based viruses in the wild, while not being detected by Antivirus software. This makes me wonder if they are of any use, but that's another question. The most important point I would like to stress is: User behavior and vigilance _is_ the most efficient way to protect himself. Being infected happens even to the best but noticing this strange behavior and asking around has been, in this case, the most efficient response.

This said, even very simple, this virus has most characteristics one would expect:

  * Efficient dissimulation.
  * Clever propagation mechanism.
  * Centralized command server.
  * Background command loop.

This last point makes me think this virus is part of a botnet. But I may be wrong.

There are nonetheless a couple of interesting vulnerabilities in the conception itself:

  * Interpreted language makes it easy to analyze.
  * Code &#8220;obfuscation&#8221; with only base64 ???
  * No attempts to dissimulate itself better than &#8220;system files&#8221;.
  * Essential registry key is still visible.
  * &#8220;What are all theses shortcuts doing here ???&#8221; user suspicion.
  * and HEAVY on memory usage !

 [1]: https://blog.jtlebi.fr/2013/11/19/anatomy-of-a-virus-1-of-2-ituneshelper-vbe/ "Anatomy of a virus 1/2: iTunesHelper.vbe"