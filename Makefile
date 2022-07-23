.PHONY: build setup test logs teardown

# Manual build since we need SSH agent forwarding.
build:
	DOCKER_BUILDKIT=1 docker build --ssh default -t central-booking:latest .

# Bring up the application and redis
setup: build
	docker-compose up -d server redis

# Run the tests
test: build
	docker-compose up -d redis
	docker-compose run --rm server yarn test

# Alias for CI
tc-test: test

# Tail logs
logs:
	docker-compose logs -f

# Bring it all down
teardown:
	docker-compose down
