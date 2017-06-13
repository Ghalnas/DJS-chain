work : nothing
clean ::
	find . -name "*~" -exec $(RM) {} \;
	-rm -rf tmp* 

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
	if [ -d /tmp/DJS-chain ] ; then git pull ; else \
	cd /tmp ; git clone git@github.com:ChristianQueinnec/DJS-chain.git ; fi
	rsync -avu --exclude=doc --exclude=node_modules \
		--exclude='*~' \
	   . /tmp/DJS-chain/
	cd /tmp/DJS-chain/ && git status .

# ############## NPM package
# Caution: npm takes the whole directory that is . and not the sole
# content of DJS-chain.tgz 

publish : lint nsp+snyk bower.json clean
	git status .
	-git commit -m "NPM publication `date`" .
	git push
	-rm -f DJS-chain.tgz
	m DJS-chain.tgz install
	cd tmp/DJS-chain/ && npm version patch && npm publish
	cp -pf tmp/DJS-chain/package.json .
	rm -rf tmp
	npm install -g DJS-chain
	m propagate

DJS-chain.tgz :
	-rm -rf tmp
	mkdir -p tmp
	cd tmp/ && git clone https://github.com/ChristianQueinnec/DJS-chain.git
	rm -rf tmp/DJS-chain/.git
	cp -p package.json tmp/DJS-chain/ 
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
