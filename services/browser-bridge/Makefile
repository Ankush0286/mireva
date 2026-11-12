.PHONY: run test build clean

run:
	go run ./cmd/server

test:
	go test -v -race ./test/...

build:
	go build -ldflags="-s -w" -o bin/mireva-bridge.exe ./cmd/server

clean:
	rm -rf bin/