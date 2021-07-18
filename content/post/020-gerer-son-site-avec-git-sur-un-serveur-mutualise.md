---
title: Gérer son site avec GIT sur un serveur mutualisé
author: Jean-Tiare Le Bigot
layout: post
date: 2013-11-30
url: /2013/11/30/gerer-son-site-avec-git-sur-un-serveur-mutualise/
categories:
  - Dev-Web
  - Sysadmin
tags:
  - continuous-integration
  - git
  - OVH
---
Que l'on souhaite disposer simplement d'un gestionnaire de version pour un projet occasionnel ou mettre en place une véritable solution &#8220;d'Intégration Continue&#8221; (&#8220;Continuous Integration&#8221; en anglais ou &#8220;CI&#8221;) GIT est probablement la solution la plus puissante et la plus versatile. Cet article retrace les étapes clés pour mettre en place GIT sur un serveur mutualisé.

**Prérequis**:

  * Compte Mutualisé avec accès SSH ([à partir de l'offre pro chez OVH par ex][1])
  * Connaissance de base de GIT ainsi qu'un client fonctionnel ([documentation][2])
  * Connaissances de bases de SSH/Bash

## Première étape: Initialiser un dépôt distant

<!--more-->

**Dans votre &#8220;/homez.123/<votre identifiant>&#8221;:**

<pre class="brush: bash; title: ; notranslate" title="">git init --bare site-perso.git
# Initialized empty Git repository in /homez.123/identifiant/site-perso.git/
</pre>

Cette commande initialise un dépôt git &#8220;nue&#8221; (bare) dans le dossier \`site-perso.git\`. Aucune copie de travail ne sera présente sur le serveur. Et c'est probablement ce que vous voulez 😉

## Deuxième étape: Clone local et première publication

**Clone local:**

<pre class="brush: bash; title: ; notranslate" title="">git clone identifiant@ftp.cluster012.ovh.net:site-perso.git
# Cloning into 'site-perso'...
# warning: You appear to have cloned an empty repository.
# Checking connectivity... done
cd site-perso/
</pre>

**Création d'une première page:**

<pre class="brush: bash; title: ; notranslate" title="">echo "Bienvenu sur mon nouveau site" &gt; index.html
git add index.html
git commit -am "ajoute la page d'accueil"
# [master (root-commit) 87a0483] ajoute la page d'accueil
#  1 file changed, 1 insertion(+)
#  create mode 100644 index.html
</pre>

**Publication:**

<pre class="brush: bash; title: ; notranslate" title="">git push origin master
# Counting objects: 3, done.
# Writing objects: 100% (3/3), 262 bytes | 0 bytes/s, done.
# Total 3 (delta 0), reused 0 (delta 0)
# To identifiant@ftp.cluster012.ovh.net:site-perso.git
#  * [new branch]      master -&gt; master
</pre>

On a maintenant un site avec une page statique versionné. Une copie du dépôt GIT se trouve directement sur le serveur web. Toute personne disposant d'un accès à ce compte SSH aura la possibilité de contribuer au dépôt.

## Troisième étape (optionnelle): Accès collaborateurs et Public

**Accès en écriture pour les collaborateurs, restreint à GIT:**

Dans la mesure où l'on a pas la main sur le système d'authentification système, on va utiliser l'authentification par clé publique ssh en forçant la commande &#8220;git-shell&#8221;. De cette manière, on bloque l'accès à toutes actions autres que GIT (sftp, shell, tunnel, &#8230;). Pour plus d'information sur l'authentification par clé publique SSH, je vous invite à consulter [l’excellent manuel de GIT][3].

Dans le fichier `~/.ssh/authorized_keys`, ajoutez une ligne du type:

<pre class="brush: plain; title: ; notranslate" title="">command="git-shell",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty ssh-rsa AAAAD3NzaC1yc2EABBBCIwAAAQEAtRFmADxUSCX97CS/Uh7/N0y0vL...
</pre>

En utilisant une technique comparable il serait possible de mettre en place un contrôle d'autorisation fine mais cela sort du cadre de cet article. Pour plus d'informations sur une piste possible, je vous invite à consulter le très complet [projet gitolite][4]. Bien qu'il ne soit pas très adapté à un hébergement mutualisé, ses techniques pourront servir de référence.

**Accès en public en lecture seule:**

Exemple: ouvrir un accès public à `site-perso.git`

<pre class="brush: bash; title: ; notranslate" title=""># Dans votre "/homez.123/&lt;votre identifiant&gt;"

# 1/ activer la publication automatique
mv site-perso.git/hooks/post-update.sample site-perso.git/hooks/post-update
chmod +x site-perso.git/hooks/post-update

# 2/ publication dans le dossier web `public-git`
mkdir -p www/public-git
cd www/public-git
ln -s ../../site-perso.git ./
</pre>

Votre dépôt peut maintenant être cloné avec `git clone http://www.example.com/public-git/site-perso.git`. Pour révoquer l'accès, il suffit de supprimer le lien dans `www/public-git/site-perso.git`. Il n'est pas nécessaire de supprimer le &#8220;hook&#8221;. Pour ajouter une authentification minimale, la méthode habituelle par &#8220;htaccess&#8221; pourra être employée.

## Quatrième étape (optionnelle): Déploiement continue (Oh Yeah !)

La crème de la crème avec GIT, ce sont les &#8220;hook&#8221; que je traduirai par &#8220;prises&#8221; en français. Ce sont des points sur lesquels on se branche aisément pour personnaliser un traitement. On a déjà utilisé l'un de ceux qui sont fourni à titre d'exemple dans tout dépôt GIT pour le rendre disponible en HTTP.

Ici, nous avons besoin d'une &#8220;prise&#8221; sur mesure qui va se charger de mettre à jour `site-perso` à chaque fois qu'une mise à jour est &#8220;poussée&#8221; (publiée) sur la branche &#8220;prod&#8221;.

**Exemple de &#8220;prise&#8221; GIT assurant la publication automatique:**

<pre class="brush: bash; title: site-perso.git/hooks/post-receive; notranslate" title="site-perso.git/hooks/post-receive">#!/bin/bash

# Pour chaque branche affectée par un "push", GIT
# nous passe sur une ligne et dans cet ordre:
# &lt;ancienne révision&gt; &lt;nouvelle révision&gt; &lt;~nom de la branche&gt;
while read oldrev newrev ref
do
    branch=`echo $ref | cut -d/ -f3`
    # mise à jour de la version de production ?
    if [ "$branch" == "prod" ]
    then
        reponame=$(basename `pwd` | sed 's/\.git$//')
        # 1/ passer le site en maintenance
        echo "[$reponame] 1/4 Passage en mode maintenance"
        # 2/ mettre à jour le code 
        echo "[$reponame] 2/4 Mise à jour"
        GIT_WORK_TREE=~/$reponame git checkout -f $branch
        # 3/ Paramètrage, migration de schéma, ...
        echo "[$reponame] 3/4 Migration"
        # 4/ rendre le site à nouveau disponible
        echo "[$reponame] 4/4 Passage en mode production"
    fi
done
</pre>

**Activer la prise:** 

<pre class="brush: bash; title: ; notranslate" title="">chmod +x site-perso.git/hooks/post-receive</pre>

**Exemple de fonctionnement:**

<pre class="brush: bash; title: session git locale &#039;site-perso&#039;; notranslate" title="session git locale &#039;site-perso&#039;">git checkout master
# Switched to branch 'master'

echo "version 1.2" &gt;&gt; CHANGELOG
git commit -am "Update CHANGELOG"
# [master 75c770c] Update CHANGELOG
#  1 file changed, 1 insertion(+)

git checkout prod
# Switched to branch 'prod'

git merge master
# Updating 2f8b5ca..75c770c
# Fast-forward
#  CHANGELOG | 1 +
#  1 file changed, 1 insertion(+)

git push
# Counting objects: 5, done.
# Delta compression using up to 4 threads.
# Compressing objects: 100% (2/2), done.
# Writing objects: 100% (3/3), 312 bytes | 0 bytes/s, done.
# Total 3 (delta 0), reused 0 (delta 0)
# remote: [site-perso] 1/4 Passage en mode maintenance
# remote: [site-perso] 2/4 Mise a jour
# remote: Switched to branch 'prod'
# remote: [site-perso] 3/4 Migration
# remote: [site-perso] 4/4 Passage en mode production
# To lj75593x1@ftp.cluster012.ovh.net:site-perso.git
#    2f8b5ca..75c770c  master -&gt; master
#    2f8b5ca..75c770c  prod -&gt; prod
</pre>

## Conclusion

GIT est incroyablement puissant, mais ça vous le saviez déjà. Bien maîtrisé, il permet de mettre en place à moindre frais une véritable solution de déploiement continue et de travail collaboratif pour un site Web. Un grand &#8220;plus&#8221; en terme de professionnalisme. D'autre part, cette solution à l'immense avantage de fonctionner avec une offre d'hébergement mutualisé en disposant d'un simple accès SSH+GIT.

Happy GITing !

 [1]: http://www.ovh.com/fr/hebergement-web/ "Hébergement Web chez OVH"
 [2]: http://git-scm.com/documentation "Introduction à GIT"
 [3]: http://git-scm.com/book/fr/Git-sur-le-serveur-G%C3%A9n%C3%A9ration-des-cl%C3%A9s-publiques-SSH "Manuel GIT - authentification par clé publique SSH"
 [4]: https://github.com/sitaramc/gitolite/