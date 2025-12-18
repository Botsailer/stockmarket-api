export function getPrototypeChain(obj: any) {
    const chain = [];
    let proto = Object.getPrototypeOf(obj);
    while (proto) {
        chain.push(proto.constructor.name);
        proto = Object.getPrototypeOf(proto);
    }
    return chain;
}
