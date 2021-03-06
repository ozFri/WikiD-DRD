#    This file is part of rhizi, a collaborative knowledge graph editor.
#    Copyright (C) 2014-2015  Rhizi
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU Affero General Public License as published
#    by the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU Affero General Public License for more details.
#
#    You should have received a copy of the GNU Affero General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.


# -*- coding: utf-8 -*-

import logging
import os
import re
import types
from functools import wraps

from . import neo4j_schema


log = logging.getLogger('rhizi')


# regexp to validate email (from Django source)
email_re = re.compile(
r"(^[-!#$%&'*+/=?^_`{}|~0-9A-Z]+(\.[-!#$%&'*+/=?^_`{}|~0-9A-Z]+)*"  # dot-atom
r'|^"([\001-\010\013\014\016-\037!#-\[\]-\177]|\\[\001-011\013\014\016-\177])*"' # quoted-string
r')@(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,6}\.?$', re.IGNORECASE)  # domain


def fileage(filename):
    return os.stat(filename).st_mtime


def cache_file_property(filename_attr, no_file_return):
    def wrapper(f):
        cache = [None]
        @wraps(f)
        def inner(self, *args, **kw):
            filename = getattr(self, filename_attr)
            if filename is None or not os.path.isfile(filename):
                return no_file_return
            cur_age = fileage(filename)
            if cache[0] is None or cur_age > cache[0][0]:
                log.info("rereading {}".format(filename))
                cache[0] = (cur_age, f(self, *args, **kw))
            return cache[0][1]
        return inner
    return wrapper


class RZ_Config(object):
    """
    rhizi-server configuration

    TODO: config option documentation

        listen_address
        listen_port
        log_level: upper/lower case log level as specified by the logging module
        neo4j_url
        root_path: root path from which the server will serve content
        user_db_path: absolute path to a Berkeley DB file used to store user accounts & password hash values
        template.d_path: absolute path to the jinja HTML template dir
    """

    @staticmethod
    def generate_default():
        cfg = {}

        #
        # [!] All resource paths are converted to absolute values after
        #     reading the actual configuration
        #

        cfg['config_dir'] = '.'
        cfg['development_mode'] = False

        #
        # - root_path: path to server root - relative paths are converted to absolute
        #                                    default: current working dir
        # - user_db_path: user_db path - relative paths are converted to absolute
        # - template_d_path: root_path relative location of template dir
        #
        cfg['root_path'] = '.'
        cfg['user_db_path'] = './user_db.db'
        cfg['fragment_d_path'] = '/static/fragment.d'
        cfg['template_d_path'] = '/static/fragment.d/template.d'

        # client configuration
        cfg['optimized_main'] = False

        # log
        cfg['log_level'] = 'INFO'
        cfg['log_path'] = '.'

        # Mail settings
        cfg['mta_host'] = '127.0.0.1'
        cfg['mta_port'] = 25
        cfg['mail_default_sender'] = 'rhizi@localhost'
        cfg['feedback_recipient'] = ''

        # Neo4j
        #    - user/pw: used when neo4j access control is enabled
        cfg['neo4j_url'] = 'http://127.0.0.1:7474'
        cfg['neo4j_user'] = None
        cfg['neo4j_pw'] = None

        # Network settings
        #    - reverse_proxy_host: proxy host name as seen by clients
        #
        cfg['listen_address'] = '127.0.0.1'
        cfg['listen_port'] = 8080
        cfg['reverse_proxy_host'] = None
        cfg['reverse_proxy_port'] = None

        # User feedback settings
        cfg['feedback_recipient'] = 'feedback@rhizi.local'

        # Piwik
        cfg["piwik_url"] = None
        cfg["piwik_id"] = None

        # Flask
        cfg['static_url_path'] = '/static'

        # Flask keys
        cfg['SECRET_KEY'] = ''

        # Security
        #   - acl_wl__email_domain_set: comma separated email domain whitelist matched during signup.
        #                               depends on 'access_control==True', default: no restriction applied
        #   - acl_wl__email_address_file_path: path to email address whitelist file containing an email per line
        #                                      once read, the attribute acl_wl__email_address_set should be available
        #
        cfg['access_control'] = True
        cfg['acl_wl__email_domain_set'] = None
        cfg['acl_wl__email_address_file_path'] = None
        cfg['signup_enabled'] = True

        # Neo4j connection
        cfg['neo4j_url'] = 'http://127.0.0.1:7474'

        # Logging
        cfg['log_path'] = 'rhizi-server.log'

        # Rhizi
        cfg['rzdoc__mainpage_name'] = neo4j_schema.RZDOC__DEFAULT_MAINPAGE_NAME
        cfg['rzdoc__name__max_length'] = neo4j_schema.RZDOC__NAME__MAX_LENGTH
        cfg['rzhome__logo_file'] = "logo-red.png"
        cfg['rzhome__logo_file_link'] = "https://github.com/Rhizi/rhizi"

        ret = RZ_Config()
        ret.__dict__ = cfg  # allows setting of @property attributes

        return ret

    @staticmethod
    def init_from_file(file_path):

        if False == os.path.exists(file_path):
            raise Exception('config file not found: ' + file_path)

        cfg = RZ_Config.generate_default()
        cfg.config_dir = os.path.abspath(os.path.dirname(file_path))  # bypass prop restriction

        with open(file_path, 'r') as f:
            for line in f:
                if re.match('(^#)|(\s+$)', line):
                    continue

                kv_arr = line.split('=')
                if len(kv_arr) != 2:
                    raise Exception('failed to parse config line: ' + line)

                k, v = map(str.strip, kv_arr)
                if k.isupper() and not hasattr(cfg, k):  # Flask config key, add & continue
                    setattr(cfg, k, v)
                    continue

                if not k.isupper() and not hasattr(cfg, k):  # not Flask config key & unknown
                    raise Exception('unrecognized config key: \'%s\'' % (k))

                if '' == v: v = None

                if v is None: continue

                f = getattr(cfg, k)
                type_f = type(f)
                if bool == type_f:
                    v = v in ("True", "true")  # workaround bool('false') = True
                elif f is not None:
                    v = type_f(v)

                # FIXME: handle type cast for keys which default to None (always str)

                # [!] we can't use k.lower() as we are loading Flask configuration
                # keys which are expected to be capitalized
                setattr(cfg, k, v)

        # use absolute paths for the following
        for path in ['root_path',
                     'user_db_path']:
            path_value = getattr(cfg, path)
            if False == os.path.isabs(path_value):
                setattr(cfg, path, os.path.abspath(path_value))

        # authentication keys - see issue #419
        # for auth_key in ['neo4j_user', 'neo4j_pw']:
        #     if None == cfg.get(auth_key): raise Exception('config: missing key: ' + auth_key)

        return cfg

    def __str__(self):
        kv_item_set = []
        for k, v in self.__dict__.items():
            if k == 'SECRET_KEY':  # exclude key from logs
                v = v[:3] + '...'
            kv_item_set.append('%s: %s' % (k, v))

        kv_item_set.sort()
        return '\n'.join(kv_item_set)

    @property
    @cache_file_property('acl_wl__email_address_file_path', None)
    def acl_wl__email_address_set(self):
        """
        lazy load on first access from configured file source

        [!] may cache None value
        """

        # emails to whitelist
        wl_email_set = []

        # attempt to init from email file
        if self.acl_wl__email_address_file_path is not None:

            with open(self.acl_wl__email_address_file_path) as email_address_file:
                for line in email_address_file.readlines(): # one email by line
                    email = line.strip()
                    # check email format
                    if email_re.search(email) is None:
                        raise ValueError("Badly formatted email address : {}".format(email))
                    else :
                        wl_email_set.append(email)

        log.info('acl initialized: acl_wl__email_address {}, email-count: {}'.format(
            self.acl_wl__email_address_file_path, len(wl_email_set)))
        log.info('1000 first bytes of email list: {}'.format(repr(wl_email_set)[:1000]))
        return wl_email_set

    @property
    def db_base_url(self):
        return self.neo4j_url

    @property
    def tx_api_path(self):
        return '/db/data/transaction'

    @property
    def config_dir_path(self):
        return self.config_dir

    @property
    def secret_key(self):
        return self.SECRET_KEY
