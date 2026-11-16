/*
 * Outpost's stand-in for <dlfcn.h> in the WebAssembly build of ITURHFProp.
 *
 * On Linux, ITURHFProp loads P533 and P372 as shared libraries with dlopen and dlsym.
 * WebAssembly has no shared libraries here: the three are linked into one program,
 * and these two calls answer from a fixed table of the functions it was linked with
 * (outpost-dl.c). Nothing is ever loaded.
 */
#ifndef OUTPOST_DLFCN_H
#define OUTPOST_DLFCN_H

#define RTLD_NOW 2

void *dlopen(const char *file, int mode);
void *dlsym(void *handle, const char *name);

#endif
