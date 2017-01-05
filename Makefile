.PHONY: test test-ci-coverage release

_MOCHA=node_modules/.bin/_mocha
ISTANBUL=node_modules/.bin/istanbul
CODECOV=node_modules/.bin/codecov

authors:
	git shortlog -se \
	  | perl -spe 's/^\s+\d+\s+//' \
	  | sed -e '/brianreavis/d' \
	  > AUTHORS

test:
	npm run test-ci

test-ci-coverage:
	npm install codecov.io
	npm install istanbul
	@rm -rf coverage
	$(ISTANBUL) cover $(_MOCHA) --report lcovonly -- -R tap

	@echo
	@echo Sending report to codecov...
	@cat ./coverage/lcov.info | $(CODECOV)
	@rm -rf ./coverage
	@echo Done

release:
ifeq ($(strip $(version)),)
	@echo "\033[31mERROR:\033[0;39m No version provided."
	@echo "\033[1;30mmake release version=1.0.0\033[0;39m"
else
	rm -rf node_modules
	npm install
	make test
	npm version $(version)
	npm publish
	git push origin master
	git push origin --tags
endif
