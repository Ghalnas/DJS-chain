work : nothing
clean ::
	find . -name "*~" -exec $(RM) {} \;
	-rm -rf tmp* 

tests :
	jasmine spec/db-spec.js spec/web-spec.js \
		spec/bro-spec.js spec/wsapi-spec.js

start.server :
	cd Site/ && node ../src/chain.js

propagate.git :
	if [ -d /tmp/DJS-chain ] ; then git pull ; else \
	cd /tmp ; git clone git@github.com:ChristianQueinnec/DJS-chain.git ; fi
	rsync -avu --exclude=doc --exclude=node_modules \
		--exclude='*~' \
	   . /tmp/DJS-chain/
	cd /tmp/DJS-chain/ && git status .

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
