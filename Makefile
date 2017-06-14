work : nothing
clean ::
	find . -name "*~" -exec $(RM) {} \;
	-rm -rf tmp*

TMP	=	tmp/DJS-chain

tests :
	jasmine spec/db-spec.js spec/web-spec.js \
		spec/bro-spec.js spec/wsapi-spec.js

start.server :
	cd Site/ && node ../src/chain.js

build.webapp :
	-rm -rf Site/dist
	gulp

lint : lint.with.jshint lint.with.eslint 
lint.with.jshint :
	node_modules/.bin/jshint src/*.js
	node_modules/.bin/jshint Site/js/*.js
lint.with.eslint :
	node_modules/.bin/eslint src/*.js
	node_modules/.bin/eslint Site/*.js

nsp+snyk :
	npm link nsp
	node_modules/.bin/nsp check
	npm link snyk
	-node_modules/.bin/snyk test DJS-chain

propagate.git : lint build.webapp
	mkdir -p ${TMP}
	if [ -d ${TMP}/.git ] ; then git pull ; else \
	cd tmp ; git clone git@github.com:ChristianQueinnec/DJS-chain.git ; fi
	rsync -avu --exclude=doc --exclude=node_modules \
		--exclude='*~' --exclude=.git --exclude=tmp \
		--exclude=Swagger/javascript-client \
		--exclude=DJS-chain.tgz \
	   . ${TMP}/
	cd ${TMP}/ && git status .
	@echo "      Don't forget to commit and push in ${TMP}"
# NOTA: there are some differences between my git in . and the github
# in TMP that registers more files (mainly Site/dist/ files) to ease
# the distribution.

# ############## NPM package
# Caution: npm takes the whole directory that is . and not the sole
# content of DJS-chain.tgz 

publish : lint nsp+snyk clean propagate.git
	cd ${TMP}/ && git status .
	-cd ${TMP}/ && git commit -m "NPM publication `date`" .
	cd ${TMP}/ && git push
	-rm -f DJS-chain.tgz
	m DJS-chain.tgz install
	cd ${TMP}/ && npm version patch && npm publish
	cp -p ${TMP}/package.json .
	npm install -g djs-chain

DJS-chain.tgz : 
	cp -p package.json ${TMP}/ 
	tar czf DJS-chain.tgz -C tmp DJS-chain
	tar tzf DJS-chain.tgz

REMOTE  =       www.paracamplus.com
install : DJS-chain.tgz
	rsync -avu DJS-chain.tgz \
                ${REMOTE}:/var/www/www.paracamplus.com/Courses/djs/TGZ/


# ###### Miscellaneous

doc:
	cat .esdoc.json
	node_modules/.bin/esdoc

swagger : Swagger/swagger.json
#	docker pull swaggerapi/swagger-editor
	docker run -p 8080:8080 swaggerapi/swagger-editor
	echo " open http://127.0.0.1:8080/ "
# publish it on swaggerhub ?
# does not describe well websocket



# end of Makefile
