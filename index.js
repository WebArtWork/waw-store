const nginx = `server {
	server_name HOST;
	location / {
			client_max_body_size 10M;
			proxy_set_header X-Real-IP $remote_addr;
			proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
			proxy_set_header Host $http_host;
			proxy_set_header X-NginX-Proxy true;
			proxy_pass http://127.0.0.1:PORT;
			proxy_redirect off;
	}
	listen 80;
}`;
const domain_regex =
  /^(?:(?:https?|ftp):\/\/)?(?:www\.)?([a-z0-9.-]+\.[a-z]{2,})(?:\/.*)?$/i;
const SSL = `certbot --nginx -d HOST --redirect`;
const filePath = "/etc/nginx/conf.d/HOST.conf";
const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const template = path.join(process.cwd(), "template");
module.exports = async (waw) => {
  if (!waw.config.store) {
    waw.config.store = {};
  }
  waw.stores = async (query = {}, limit, count = false) => {
    let exe = count ? waw.Store.countDocuments(query) : waw.Store.find(query);

    if (limit) {
      exe = exe.limit(limit);
    }

    return await exe;
  };

  waw.store = async (query) => {
    return await Store.findOne(query);
  };

  waw.crud("store", {
    get: [
      {
        ensure: waw.next,
      },
      {
        name: "public",
        ensure: waw.next,
        query: () => {
          return {};
        },
      },
    ],
    update: {
      query: (req) => {
        if (req.user.is.admin) {
          return {
            _id: req.body._id,
          };
        } else {
          return {
            moderators: req.user._id,
            _id: req.body._id,
          };
        }
      },
    },
    delete: {
      query: (req) => {
        if (req.user.is.admin) {
          return {
            _id: req.body._id,
          };
        } else {
          return {
            moderators: req.user._id,
            _id: req.body._id,
          };
        }
      },
    },
  });
  await waw.wait(500);
  const allGroups = await waw.category_groups();
  const allTags = await waw.tagsWithCategories();
  const serveStore = async (store, _template) => {
    waw.serve(_template, {
      prefix: "/" + store.theme.folder,
      host: store.domain,
    });
    const query = {
      author: store.author,
    };
    const contents = await waw.contents(query);
    const tags = allTags.slice();
    for (let i = tags.length - 1; i >= 0; i--) {
      if (
        !tags[i].category ||
        tags[i].category.group === "store" ||
        waw.config.groups.map((g) => g.name).indexOf(tags[i].category.group) ===
          -1
      ) {
        tags.splice(i, 1);
        continue;
      }

      for (const group of waw.config.groups) {
        if (tags[i].category.group === group.name) {
          if (
            !(await waw[group.docs](
              {
                ...query,
                tag: tags[i]._id,
              },
              0,
              true
            ))
          ) {
            tags.splice(i, 1);
          }
          break;
        }
      }
    }
    const groups = JSON.parse(JSON.stringify(allGroups));
    const tagIds = tags.map((t) => t._id.toString());
    for (let k = groups.length - 1; k >= 0; k--) {
      groups[k].categories = groups[k].categories || [];

      for (let j = groups[k].categories.length - 1; j >= 0; j--) {
        groups[k].categories[j].tags = groups[k].categories[j].tags || [];
        for (let i = groups[k].categories[j].tags.length - 1; i >= 0; i--) {
          if (
            tagIds.indexOf(groups[k].categories[j].tags[i]._id.toString()) ===
            -1
          ) {
            groups[k].categories[j].tags.splice(i, 1);
          }
        }

        if (!groups[k].categories[j].tags.length) {
          groups[k].categories.splice(j, 1);
        }
      }

      if (!groups[k].categories.length) {
        groups.splice(k, 1);
      }
    }
    const footer = {
      contents,
      groups,
    };
    const templateJson = {
      variables: store.variables,
      tags,
      store,
      groups,
      footer,
    };

    waw.build(_template, "index");
    waw.store_landing = {};
    waw.serve_land[store.domain] = async (req, res) => {
      const json = {
        ...templateJson,
        title: waw.config.storeTitle || waw.config.title,
        description: waw.config.storeDescription || waw.config.description,
        image: waw.config.storeImage || waw.config.image,
      };
      for (const field in waw.store_landing) {
        json[field] = await waw.store_landing[field](query);
      }
      res.send(
        waw.render(
          path.join(_template, "dist", "index.html"),
          json,
          waw.translate(req)
        )
      );
    };
    // config store
    const prepareObject = (obj) => {
      if (typeof obj === "string") {
        obj = obj.split(" ");
      }

      if (!Array.isArray(obj) && typeof obj === "object") {
        obj = [obj];
      }

      for (let i = 0; i < obj.length; i++) {
        if (typeof obj[i] === "string") {
          obj[i] = {
            path: obj[i],
          };
        }
      }

      return obj;
    };
    const configurePage = (page) => {
      waw.build(_template, page.module);
      waw["serve_" + page.module][store.domain] = async (req, res) => {
        const json = {
          ...templateJson,
          title: " | " + store.name,
          description:
            store.data[page.module + "_description"] ||
            store.description ||
            templateJson.description,
        };

        if (page.doc) {
          page.doc = prepareObject(page.doc);
          for (const doc of page.doc) {
            json[doc.path] = await waw[doc.path]({
              ...query,
              _id: req.params._id,
            });
            if (json.title === " | " + store.name) {
              json.title = json[doc.path].name + json.title;
            }
          }
        } else {
          const name = store.data[page.module + "_name"] || page.module;
          json.title = name + json.title;
        }

        if (page.docs) {
          page.docs = prepareObject(page.docs);
          for (const doc of page.docs) {
          json[doc.path] = await waw[doc.path](
		  req.params._id ?
		  { ...query, _id: req.params.tag_id}:
		  query,
		 doc.limit || 20
		  );

            footer[doc.footerPath || doc.path] = await waw[doc.path](
              query,
              doc.footerLimit || 5
            );
          }
        }

        res.send(
          waw.render(
            path.join(_template, "dist", page.module + ".html"),
            json,
            waw.translate(req)
          )
        );
      };
    };
    for (const page of waw.config.store.pages || []) {
      configurePage(page);
    }

    waw.build(_template, "content");
    const serve_content = async (content) => {
      waw.app.get(content.url, async (req, res, next) => {
        if (req.get("host") === store.domain) {
          res.send(
            waw.render(
              path.join(_template, "dist", "content.html"),
              {
                ...templateJson,
                ...content.toObject(),
                content,
                data: {
                  ...store.data,
                  ...content.data,
                },
                title: content.name + " | " + store.name,
              },
              waw.translate(req)
            )
          );
        } else {
          next();
        }
      });
    };
    for (const content of contents) {
      serve_content(content);
    }
  };

  // manage Stores
  waw.loadStores = async (author = "") => {
    const stores = await waw.Store.find(
      author
        ? {
            author,
            domain: {
              $exists: true,
            },
          }
        : {
            domain: {
              $exists: true,
            },
          }
    ).populate({
      path: "theme",
      select: "folder",
    });
    if (!author) {
      waw.build(template, "stores");
      waw.build(template, "store");
      setTimeout(() => {
        waw.app.get("/stores", (req, res) => {
          res.send(
            waw.render(
              path.join(template, "dist", "stores.html"),
              {
                ...waw.readJson(path.join(template, "template.json")),
                ...waw.readJson(
                  path.join(template, "pages", "stores", "page.json")
                ),
                ...waw.config,
                title: waw.config.storeTitle || waw.config.title,
                description: waw.config.storeDescription,
                stores,
              },
              waw.translate(req)
            )
          );
        });
      }, 1000);
    }

    const serveStorePage = (store) => {
      waw.app.get("/store/" + store._id, (req, res) => {
        res.send(
          waw.render(
            path.join(template, "dist", "store.html"),
            {
              ...waw.readJson(path.join(template, "template.json")),
              ...waw.readJson(
                path.join(template, "pages", "stores", "page.json")
              ),
              ...waw.config,
              categories: waw.tag_groups("store"),
              title: waw.config.storeTitle || waw.config.title,
              image: waw.config.storeImage || waw.config.image,
              description:
                waw.config.storeDescription || waw.config.description,
              store,
            },
            waw.translate(req)
          )
        );
      });
    };

    for (const store of stores) {
      serveStorePage(store);

      if (!store.theme) {
        continue;
      }

      const _template = path.join(
        process.cwd(),
        "templates",
        store.theme.folder
      );

      serveStore(store, _template);
    }
  };
  waw.loadStores();

  // manage SSL
  const setStore = async (store) => {
    if (waw.reserved(store.domain)) {
      return;
    }

    if (
      waw.config.production &&
      store.domain &&
      store.theme &&
      domain_regex.test(store.domain) &&
      !store.domain.endsWith("." + waw.config.land)
    ) {
      setNginx(store.domain, filePath.replace("HOST", store.domain));
    }

    if (store.theme) {
      const _store = await waw.Store.findOne({
        _id: store._id,
      }).populate({
        path: "theme",
        select: "folder",
      });

      const _template = path.join(
        process.cwd(),
        "templates",
        _store.theme.folder
      );

      serveStore(_store, _template);
    }
  };

  waw.on("store_create", setStore);
  waw.on("store_update", setStore);

  const setNginx = (domain, _filePath) => {
    if (!fs.existsSync(_filePath)) {
      fs.writeFileSync(
        _filePath,
        nginx
          .replace("HOST", domain)
          .replace("PORT", waw.config.store.nginxPort)
      );
    }

    if (fs.readFileSync(_filePath).length < 500) {
      execSync(SSL.replace("HOST", domain));
      execSync("service nginx restart");
    }
  };

  waw.store_middleware = async (req, res, next) => {
    const store = await waw.Store.find({
      domain: req.get("host"),
    });

    if (store) {
      res.locals.store = store;
    }

    next();
  };
};
