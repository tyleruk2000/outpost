/*
 * dlopen and dlsym for the WebAssembly build of ITURHFProp: see include/dlfcn.h.
 *
 * Only the two library names the ITU's code asks for are "opened", and only the
 * functions it asks for are found; any other name is an error, so a call the table
 * does not know about fails loudly instead of jumping somewhere.
 */
#include <stdio.h>
#include <string.h>

#include "P533.h"
#include "dlfcn.h"

/* Defined in P533.c and not declared in its header. */
char const *P533CompileTime(void);

struct entry {
  const char *name;
  void *function;
};

static const struct entry p533[] = {
    {"P533Version", (void *)P533Version},
    {"P533CompileTime", (void *)P533CompileTime},
    {"P533", (void *)P533},
    {"AllocatePathMemory", (void *)AllocatePathMemory},
    {"FreePathMemory", (void *)FreePathMemory},
    {"InputDump", (void *)InputDump},
    {"Bearing", (void *)Bearing},
    {"ReadType11", (void *)ReadType11},
    {"ReadType13", (void *)ReadType13},
    {"ReadType14", (void *)ReadType14},
    {"IsotropicPattern", (void *)IsotropicPattern},
    {"ReadIonParametersBin", (void *)ReadIonParametersBin},
    {"ReadIonParametersTxt", (void *)ReadIonParametersTxt},
    {"ReadP1239", (void *)ReadP1239},
    {NULL, NULL},
};

static const struct entry p372[] = {
    {"P372Version", (void *)P372Version},
    {"P372CompileTime", (void *)P372CompileTime},
    {"Noise", (void *)Noise},
    {"AllocateNoiseMemory", (void *)AllocateNoiseMemory},
    {"FreeNoiseMemory", (void *)FreeNoiseMemory},
    {"InitializeNoise", (void *)InitializeNoise},
    {"ReadFamDud", (void *)ReadFamDud},
    {NULL, NULL},
};

void *dlopen(const char *file, int mode) {
  (void)mode;
  if (strcmp(file, "libp533.so") == 0) return (void *)p533;
  if (strcmp(file, "libp372.so") == 0) return (void *)p372;
  fprintf(stderr, "outpost-dl: no library %s\n", file);
  return NULL;
}

void *dlsym(void *handle, const char *name) {
  for (const struct entry *e = handle; e->name; e++) {
    if (strcmp(e->name, name) == 0) return e->function;
  }
  fprintf(stderr, "outpost-dl: no function %s\n", name);
  return NULL;
}
