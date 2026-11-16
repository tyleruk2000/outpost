//! The bridge as a native program: a request on standard input, the answer on standard
//! output. Used to compare this build with the WebAssembly one and with the original.
use std::io::Read;

fn main() {
    let mut input = String::new();
    std::io::stdin().read_to_string(&mut input).expect("reading the request");
    match outpost_voacap::answer(&input) {
        Ok(text) => println!("{text}"),
        Err(message) => {
            eprintln!("{message}");
            std::process::exit(1);
        }
    }
}
