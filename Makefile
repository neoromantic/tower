CC = gcc
CT_VERSION := $(shell git describe --always --dirty 2>/dev/null || echo unknown)
CFLAGS = -Wall -Wextra -std=c11 -O2 -DCT_BUILD_VERSION='"$(CT_VERSION)"' $(shell pkg-config --cflags sdl2 SDL2_ttf)
LDFLAGS = $(shell pkg-config --libs sdl2 SDL2_ttf) -lm -lz

SRC = src/main.c src/ne_resource.c src/sprites.c src/tower.c src/game.c src/people.c src/twr.c src/audio.c src/sound_hook.c src/strings.c
OBJ = $(SRC:.c=.o)
BIN = simtower

.PHONY: all clean run web webserve

all: $(BIN)

$(BIN): $(OBJ)
	$(CC) -o $@ $^ $(LDFLAGS)

# Header dependencies — all .c files depend on all .h files in src/
HEADERS = $(wildcard src/*.h)

%.o: %.c $(HEADERS)
	$(CC) $(CFLAGS) -c -o $@ $<

run: $(BIN)
	./$(BIN)

# ---- Web (Emscripten) build ----
# v0 keeps the blocking main loop via ASYNCIFY (SDL_Delay yields to the
# browser); the set_main_loop refactor is queued as a refine step.
# Fonts and bundled resources are embedded.
WEBDIR = web/dist
web:
	mkdir -p $(WEBDIR)
	sed 's/__CT_VERSION__/$(CT_VERSION)/g' web/shell.html > $(WEBDIR)/.shell.gen.html
	cp web/hero.png $(WEBDIR)/hero.png
	cp web/app.js web/app.css web/manifest.webmanifest $(WEBDIR)/
	sed 's/__CT_VERSION__/$(CT_VERSION)/g' web/sw.js > $(WEBDIR)/sw.js
	cp -R web/art $(WEBDIR)/
	emcc $(SRC) -o $(WEBDIR)/index.html \
	  -std=gnu11 -O2 -DCT_BUILD_VERSION='"$(CT_VERSION)"' \
	  -sUSE_SDL=2 -sUSE_SDL_TTF=2 -sUSE_ZLIB=1 \
	  -sALLOW_MEMORY_GROWTH -sASYNCIFY -sASYNCIFY_STACK_SIZE=32768 \
	  -sSTACK_SIZE=2097152 \
	  -sINVOKE_RUN=0 -sEXIT_RUNTIME=0 \
	  -sEXPORTED_RUNTIME_METHODS=callMain,FS,IDBFS,ENV,addRunDependency,removeRunDependency,ccall \
	  -lidbfs.js \
	  --shell-file $(WEBDIR)/.shell.gen.html \
	  --preload-file web/fonts@/fonts \
	  --preload-file data/styles/schematic/tower.dat@/data/styles/schematic/tower.dat \
	  --preload-file data/styles/modern-pixel/tower.dat@/data/styles/modern-pixel/tower.dat \
	  --preload-file data/styles/warm-dollhouse/tower.dat@/data/styles/warm-dollhouse/tower.dat \
	  --preload-file data/styles/miniature-3d/tower.dat@/data/styles/miniature-3d/tower.dat \
	  --preload-file data/styles/schematic/hd@/data/styles/schematic/hd \
	  --preload-file data/styles/modern-pixel/hd@/data/styles/modern-pixel/hd \
	  --preload-file data/styles/warm-dollhouse/hd@/data/styles/warm-dollhouse/hd \
	  --preload-file data/styles/miniature-3d/hd@/data/styles/miniature-3d/hd
	rm -f $(WEBDIR)/.shell.gen.html

webserve: web
	@echo "Serving on http://$$(hostname -I | cut -d' ' -f1):8611 (and Tailscale IP)"
	cd $(WEBDIR) && python3 -m http.server 8611

clean:
	rm -f $(OBJ) $(BIN)
	rm -rf $(WEBDIR)
