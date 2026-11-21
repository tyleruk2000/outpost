/**
 * The guide to running the household's own Mosquitto for the radio, in Settings where the
 * choice is made (the same steps as docs/mesh-radio.md, "Your own Mosquitto"). Commands
 * marked as tried were run against Mosquitto 2.1 on a Mac and in Docker
 * (eclipse-mosquitto:2); the rest are marked untried. The values in the commands are the
 * ones typed in the form, so what is copied matches what Outpost will use.
 */
import { Copy } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { Disclosure } from "@/components/page";
import { Button } from "@/components/ui/button";
import { copyText } from "@/lib/clipboard";
import { notify } from "@/lib/notify";

/** A block of lines to copy as one. */
export function CopyBlock({ text, label }: { text: string; label: string }) {
  return (
    <div className="grid gap-1">
      <pre className="overflow-x-auto rounded-control bg-surface px-3 py-2 font-mono text-[0.8125rem] text-ink">{text}</pre>
      <div>
        <Button
          size="sm"
          variant="ghost"
          className="-ml-2.5"
          aria-label={`Copy ${label}`}
          onClick={() =>
            void copyText(text).then((done) =>
              done ? toast.success("Copied.") : notify.error("This browser would not copy it. Select the lines and copy them by hand."),
            )
          }
        >
          <Copy aria-hidden /> Copy
        </Button>
      </div>
    </div>
  );
}

const Step = ({ title, children }: { title: string; children: ReactNode }) => (
  <li className="grid gap-2">
    <p className="font-medium text-ink">{title}</p>
    {children}
  </li>
);

const Untried = () => <span className="text-ink-muted"> (untried)</span>;

export function MosquittoGuide({ rootTopic, outpostUser }: { rootTopic: string; outpostUser: string }) {
  const root = rootTopic.trim() || "msh/EU_868";
  const outpost = outpostUser.trim() || "outpost";
  return (
    <Disclosure summary="A guide to running your own Mosquitto for the radio" className="border-t border-border pt-3">
      <div className="grid gap-3 text-small text-ink">
        <p className="text-ink-muted">
          Choose this if you already run Mosquitto, or want other things on it. Outpost's own broker needs none of this. Every account has a
          password: never let a radio, or anything else, in without one.
        </p>
        <ol className="grid list-decimal gap-4 pl-5 marker:text-ink-muted">
          <Step title="Install it">
            <p>In Docker, on any computer (tried with eclipse-mosquitto:2, Mosquitto 2.1.4). A compose.yaml of its own:</p>
            <CopyBlock
              label="the Compose file"
              text={`services:
  mosquitto:
    image: eclipse-mosquitto:2
    container_name: mosquitto
    restart: unless-stopped
    ports:
      - "1883:1883"
    volumes:
      - ./config:/mosquitto/config
      - ./data:/mosquitto/data`}
            />
            <p>
              On a Mac (tried, 2.1.2): <code className="font-mono">brew install mosquitto</code>. On Raspberry Pi OS:{" "}
              <code className="font-mono">sudo apt install mosquitto mosquitto-clients</code>
              <Untried />. On Windows: the installer from mosquitto.org/download
              <Untried />.
            </p>
          </Step>
          <Step title="Ask for a password, and say who may use which topics">
            <p>
              The settings file (<code className="font-mono">config/mosquitto.conf</code> in Docker;{" "}
              <code className="font-mono">/etc/mosquitto/conf.d/outpost.conf</code> on a Pi). The image's own file lets anyone in: this
              replaces it.
            </p>
            <CopyBlock
              label="the settings file"
              text={`listener 1883
allow_anonymous false
password_file /mosquitto/config/passwd
acl_file /mosquitto/config/acl
persistence true
persistence_location /mosquitto/data/`}
            />
            <p>
              The access list (<code className="font-mono">config/acl</code>): Outpost reads and writes the radios' topics; each radio only
              its own root topic.
            </p>
            <CopyBlock
              label="the access list"
              text={`user ${outpost}
topic readwrite msh/#

user radio-1
topic readwrite ${root}/#`}
            />
          </Step>
          <Step title="Make the accounts, then restart it">
            <p>
              One for Outpost and one for each radio. Each asks for the password twice (in Docker, from the folder with its compose.yaml):
            </p>
            <CopyBlock
              label="the account commands"
              text={`sudo docker compose up -d
sudo docker exec -it mosquitto sh -c 'touch /mosquitto/config/passwd && chmod 0700 /mosquitto/config/passwd /mosquitto/config/acl'
sudo docker exec -it mosquitto mosquitto_passwd /mosquitto/config/passwd ${outpost}
sudo docker exec -it mosquitto mosquitto_passwd /mosquitto/config/passwd radio-1
sudo docker exec -it mosquitto chown mosquitto:mosquitto /mosquitto/config/passwd /mosquitto/config/acl
sudo docker restart mosquitto`}
            />
          </Step>
          <Step title="Check it">
            <p>Without a password it must say “not authorised”; with Outpost's, it waits for messages (Ctrl+C to stop):</p>
            <CopyBlock
              label="the check commands"
              text={`mosquitto_sub -h 127.0.0.1 -t 'msh/#' -W 3
mosquitto_sub -h 127.0.0.1 -u ${outpost} -P 'its password' -t '${root}/#' -v`}
            />
            <p>
              Then, here: the broker's address and port, user name {outpost} and its password, root topic {root}, and press Test.
            </p>
          </Step>
          <Step title="On the radio">
            <p>
              In Meshtastic's app under Settings → MQTT: the broker's address on the home network (never 127.0.0.1: that is the radio
              itself), the radio's own user name and password (radio-1), root topic {root}, JSON on, encryption off.
            </p>
          </Step>
          <Step title="TLS, so the password and messages are not in the clear on the Wi-Fi">
            <p>A certificate authority of your own and a certificate for the broker, made out to its name or address (tried):</p>
            <CopyBlock
              label="the certificate commands"
              text={`openssl req -x509 -newkey rsa:2048 -nodes -keyout ca.key -out ca.crt -days 3650 -subj "/CN=Household CA"
openssl req -newkey rsa:2048 -nodes -keyout server.key -out server.csr -subj "/CN=mosquitto"
printf "subjectAltName=IP:192.168.1.5,DNS:raspberrypi.local\\n" > san.ext
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out server.crt -days 825 -extfile san.ext`}
            />
            <p>Put the address and name of the broker's computer in san.ext. Then a second listener in the settings file:</p>
            <CopyBlock
              label="the TLS listener"
              text={`listener 8883
cafile /mosquitto/config/ca.crt
certfile /mosquitto/config/server.crt
keyfile /mosquitto/config/server.key`}
            />
            <p>
              Publish 8883 as well. Here: port 8883, TLS on, and paste ca.crt. On the radio: TLS on
              <Untried />: Meshtastic's documentation says only that the radio “attempts to establish a secure connection”, not whether it
              checks the certificate.
            </p>
          </Step>
          <Step title="Or let Outpost add the radios' accounts (dynamic security)">
            <p>
              Mosquitto's dynamic security plugin keeps accounts in a file Mosquitto writes itself and takes changes over MQTT. In place of
              password_file and acl_file (tried with eclipse-mosquitto:2, Mosquitto 2.1.4):
            </p>
            <CopyBlock
              label="the plugin lines"
              text={`plugin /usr/lib/mosquitto_dynamic_security.so
plugin_opt_config_file /mosquitto/data/dynamic-security.json`}
            />
            <CopyBlock
              label="the dynamic security commands"
              text={`sudo docker restart mosquitto
sudo docker exec mosquitto cat /mosquitto/data/dynamic-security.json.pw
sudo docker exec -it mosquitto mosquitto_ctrl -u admin dynsec deleteClient democlient
sudo docker exec -it mosquitto mosquitto_ctrl -u admin dynsec createRole outpost
sudo docker exec -it mosquitto mosquitto_ctrl -u admin dynsec addRoleACL outpost publishClientSend 'msh/#' allow
sudo docker exec -it mosquitto mosquitto_ctrl -u admin dynsec addRoleACL outpost subscribePattern 'msh/#' allow
sudo docker exec -it mosquitto mosquitto_ctrl -u admin dynsec createClient ${outpost}
sudo docker exec -it mosquitto mosquitto_ctrl -u admin dynsec addClientRole ${outpost} outpost
sudo docker exec -it mosquitto mosquitto_ctrl -u admin dynsec addClientRole ${outpost} dynsec-admin`}
            />
            <p className="text-ink-muted">
              On its first start Mosquitto 2.1 makes the file itself, with an admin account whose password is in dynamic-security.json.pw
              (the second line shows it), and a democlient that may use every topic, which the third line removes. The last line lets
              Outpost's account manage every account on the broker; leave it out to add radios yourself with mosquitto_ctrl createClient.
            </p>
          </Step>
        </ol>
      </div>
    </Disclosure>
  );
}
