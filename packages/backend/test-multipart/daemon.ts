import Redis from 'ioredis';
import IPCIDR from 'ip-cidr';

const TESTER_IP_ADDRESS = '172.24.1.1';

function getIpHash(ip: string) {
	const prefix = IPCIDR.createAddress(ip).mask(64);
	return `ip-${BigInt('0b' + prefix).toString(36)}`;
}

async function purgeLimit(host: string, client: Redis) {
	const ipHash = getIpHash(TESTER_IP_ADDRESS);
	const key = `${host}:limit:${ipHash}:signin`;
	await client.del(key);
}

const redisClient = new Redis({ host: 'redis', port: 6379 });

setInterval(() => {
	purgeLimit('cluster.test', redisClient);
}, 200);

console.log('Daemon started: purging rate limits every 200ms');
